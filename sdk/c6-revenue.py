"""
C6 Revenue SDK — Embeddable revenue capture for Carbon6 shipped tools
Zero dependencies — Python stdlib only
Auto-loads .c6-partner.json for config
"""

import json
import os
import hashlib
import hmac
import base64
import time
import threading
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

CACHE_TTL = 300  # 5 minutes
PING_TIMEOUT = 3
DEFAULT_GATEWAY = "http://localhost:6100"

_instance = None


def init(overrides=None):
    global _instance
    if _instance and not (overrides or {}).get("_force"):
        return _instance
    config = _load_config(overrides or {})
    _instance = C6Revenue(config)
    return _instance


def _load_config(overrides):
    config = {
        "toolId": overrides.get("toolId"),
        "gatewayUrl": overrides.get("gatewayUrl", DEFAULT_GATEWAY),
        "model": overrides.get("model", "freemium"),
        **overrides,
    }

    # Auto-load .c6-partner.json
    try:
        for p in [
            Path.cwd() / ".c6-partner.json",
            Path(__file__).parent / ".c6-partner.json",
            Path(__file__).parent.parent / ".c6-partner.json",
        ]:
            if p.exists():
                partner = json.loads(p.read_text())
                if "revenue" in partner:
                    config.setdefault("toolId", partner["revenue"].get("toolId") or partner.get("solution", {}).get("name"))
                    config.setdefault("gatewayUrl", partner["revenue"].get("gatewayUrl", DEFAULT_GATEWAY))
                    config.setdefault("model", partner["revenue"].get("model", "freemium"))
                elif "solution" in partner:
                    config.setdefault("toolId", partner["solution"].get("name"))
                break
    except Exception:
        pass

    return config


class C6Revenue:
    def __init__(self, config):
        self.config = config
        self.tool_id = config.get("toolId")
        self.gateway_url = config.get("gatewayUrl", DEFAULT_GATEWAY)
        self._cache = {}
        self._usage_queue = []

    def ping(self):
        """Fire-and-forget startup telemetry."""
        body = json.dumps({
            "toolId": self.tool_id,
            "version": self.config.get("version", "1.0.0"),
            "platform": os.name,
            "pythonVersion": f"{os.sys.version_info.major}.{os.sys.version_info.minor}",
            "timestamp": _now(),
        })
        threading.Thread(target=self._post, args=("/api/v1/ping", body, PING_TIMEOUT), daemon=True).start()

    def gate(self, api_key, operation="default"):
        """Validate API key and check rate limit."""
        offline = self._validate_offline(api_key)
        if not offline["valid"]:
            return {"allowed": False, "reason": offline["reason"]}

        cache_key = f"gate:{api_key}:{_today()}"
        cached = self._cache.get(cache_key)

        if not cached or time.time() - cached["ts"] > CACHE_TTL:
            try:
                res = self._post("/api/v1/gate", json.dumps({
                    "apiKey": api_key, "operation": operation, "toolId": self.tool_id,
                }))
                cached = {"data": json.loads(res), "ts": time.time()}
                self._cache[cache_key] = cached
            except Exception:
                self.record_usage(operation)
                return {"allowed": True, "tier": offline.get("tier"), "remaining": offline.get("rateLimit"), "offline": True}

        if cached["data"].get("allowed"):
            self.record_usage(operation)

        return cached["data"]

    def paywall(self, amount, metadata=None):
        """x402 micropayment for premium features."""
        metadata = metadata or {}
        try:
            res = self._post("/api/v1/x402/charge", json.dumps({
                "toolId": self.tool_id,
                "amount": amount,
                "currency": metadata.get("currency", "USD"),
                "description": metadata.get("description", f"{self.tool_id} premium feature"),
                **metadata,
            }))
            return json.loads(res)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def record_usage(self, operation="call"):
        """Record usage locally."""
        usage_dir = Path.home() / ".c6" / "usage"
        usage_dir.mkdir(parents=True, exist_ok=True)
        usage_path = usage_dir / f"{self.tool_id or 'unknown'}.json"

        try:
            usage = json.loads(usage_path.read_text())
        except Exception:
            usage = {"toolId": self.tool_id, "days": {}}

        today = _today()
        if today not in usage["days"]:
            usage["days"][today] = {"calls": 0, "operations": {}}
        usage["days"][today]["calls"] += 1
        usage["days"][today]["operations"][operation] = usage["days"][today]["operations"].get(operation, 0) + 1

        self._usage_queue.append({"operation": operation, "timestamp": _now()})

        try:
            usage_path.write_text(json.dumps(usage, indent=2))
        except Exception:
            pass

    def flush(self):
        """Batch upload cached usage."""
        if not self._usage_queue:
            return

        batch = list(self._usage_queue)
        self._usage_queue.clear()

        try:
            self._post("/api/v1/usage/batch", json.dumps({
                "toolId": self.tool_id,
                "events": batch,
            }))
        except Exception:
            self._usage_queue = batch + self._usage_queue

    def _validate_offline(self, key):
        """Offline key validation (format + expiry check)."""
        import re
        match = re.match(r"^C6K-([^-]+)-(.+)\.([A-Za-z0-9_-]+)$", key)
        if not match:
            return {"valid": False, "reason": "invalid format"}

        _, payload_b64, _ = match.groups()

        try:
            padding = 4 - len(payload_b64) % 4
            if padding != 4:
                payload_b64 += "=" * padding
            payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        except Exception:
            return {"valid": False, "reason": "corrupt payload"}

        if payload.get("expiresAt") and payload["expiresAt"] < _now():
            return {"valid": False, "reason": "expired"}

        return {"valid": True, "tier": payload.get("tier"), "rateLimit": payload.get("rateLimit")}

    def _post(self, path, body, timeout=10):
        """HTTP POST helper."""
        url = self.gateway_url.rstrip("/") + path
        req = Request(url, data=body.encode(), headers={"Content-Type": "application/json"}, method="POST")
        with urlopen(req, timeout=timeout) as res:
            return res.read().decode()


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _today():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")
