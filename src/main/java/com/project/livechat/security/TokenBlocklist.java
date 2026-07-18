package com.project.livechat.security;

import org.springframework.stereotype.Component;

import java.util.Date;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory store of revoked JWTs.
 *
 * Each entry maps token → expiry time. A background sweep removes entries
 * whose natural expiry has already passed, so the map never grows unbounded
 * even if logout is called many times.
 *
 * On a multi-instance deployment this would need to move to a shared store
 * (e.g. Redis), but for a single-server deployment this is sufficient.
 */
@Component
public class TokenBlocklist {

    private final Map<String, Date> blocked = new ConcurrentHashMap<>();

    /** Add a token to the blocklist until it expires naturally. */
    public void revoke(String token, Date expiry) {
        blocked.put(token, expiry);
        evictExpired();
    }

    /** Returns true if this token has been explicitly revoked. */
    public boolean isRevoked(String token) {
        Date expiry = blocked.get(token);
        if (expiry == null) return false;
        // If the token's natural expiry has passed, it's already useless — remove it
        if (expiry.before(new Date())) {
            blocked.remove(token);
            return false;
        }
        return true;
    }

    /** Removes entries whose tokens have expired naturally — no longer need tracking. */
    private void evictExpired() {
        Date now = new Date();
        blocked.entrySet().removeIf(e -> e.getValue().before(now));
    }
}
