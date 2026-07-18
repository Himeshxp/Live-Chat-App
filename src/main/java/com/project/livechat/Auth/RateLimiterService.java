package com.project.livechat.Auth;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * Per-IP rate limiter backed by a Caffeine cache.
 *
 * Fix 7: the old ConcurrentHashMap never evicted entries, so under IP rotation
 * or a slow DDoS the map would grow without bound and eventually exhaust heap.
 * Caffeine evicts entries that haven't been accessed for 30 minutes, keeping
 * memory usage proportional to the number of recently active IPs.
 *
 * Limits:
 *   Register: 5 requests per IP per 10 minutes
 *   Login:   10 requests per IP per 10 minutes
 */
@Service
public class RateLimiterService {

    // Buckets expire 30 minutes after last access — well past the refill window
    private final Cache<String, Bucket> registerCache = Caffeine.newBuilder()
            .expireAfterAccess(Duration.ofMinutes(30))
            .maximumSize(50_000)   // hard cap: ~50k distinct IPs in memory at once
            .build();

    private final Cache<String, Bucket> loginCache = Caffeine.newBuilder()
            .expireAfterAccess(Duration.ofMinutes(30))
            .maximumSize(50_000)
            .build();

    public boolean tryConsumeRegister(String ip) {
        return registerCache.get(ip, k -> buildRegisterBucket()).tryConsume(1);
    }

    public boolean tryConsumeLogin(String ip) {
        return loginCache.get(ip, k -> buildLoginBucket()).tryConsume(1);
    }

    // 5 tokens refilled every 10 minutes
    private Bucket buildRegisterBucket() {
        return Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(5)
                        .refillIntervally(5, Duration.ofMinutes(10))
                        .build())
                .build();
    }

    // 10 tokens refilled every 10 minutes
    private Bucket buildLoginBucket() {
        return Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(10)
                        .refillIntervally(10, Duration.ofMinutes(10))
                        .build())
                .build();
    }
}
