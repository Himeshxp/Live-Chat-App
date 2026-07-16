package com.project.livechat.Auth;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory per-IP rate limiter.
 *
 * Register endpoint: 5 requests per IP per 10 minutes.
 * Login endpoint:   10 requests per IP per 10 minutes.
 */
@Service
public class RateLimiterService {

    // Separate maps so register and login limits are tracked independently per IP
    private final ConcurrentHashMap<String, Bucket> registerBuckets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Bucket> loginBuckets = new ConcurrentHashMap<>();

    /**
     * Try to consume one token from the register bucket for the given IP.
     * Returns {@code true} if the request is allowed, {@code false} if rate-limited.
     */
    public boolean tryConsumeRegister(String ip) {
        return registerBuckets
                .computeIfAbsent(ip, k -> buildRegisterBucket())
                .tryConsume(1);
    }

    /**
     * Try to consume one token from the login bucket for the given IP.
     * Returns {@code true} if the request is allowed, {@code false} if rate-limited.
     */
    public boolean tryConsumeLogin(String ip) {
        return loginBuckets
                .computeIfAbsent(ip, k -> buildLoginBucket())
                .tryConsume(1);
    }

    // 5 tokens, refilled every 10 minutes
    private Bucket buildRegisterBucket() {
        return Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(5)
                        .refillIntervally(5, Duration.ofMinutes(10))
                        .build())
                .build();
    }

    // 10 tokens, refilled every 10 minutes
    private Bucket buildLoginBucket() {
        return Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(10)
                        .refillIntervally(10, Duration.ofMinutes(10))
                        .build())
                .build();
    }
}
