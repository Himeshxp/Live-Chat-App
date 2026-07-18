package com.project.livechat.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.util.Date;

/**
 * Handles JWT generation and validation.
 *
 * The secret is expected as a Base64-encoded string via the JWT_SECRET env var.
 * On startup, we verify the decoded key is at least 256 bits (32 bytes) — the
 * minimum for HMAC-SHA256. The app will refuse to start if the key is too short.
 */
@Service
public class JwtService {

    @Value("${jwt.secret}")
    private String base64Secret;

    @Value("${jwt.expiration.ms}")
    private long expirationMs;

    // Cached key — built once on startup, reused for every token operation
    private SecretKey cachedKey;

    @PostConstruct
    public void init() {
        byte[] keyBytes;

        // Try to decode as Base64URL first (handles keys generated with openssl or
        // any Base64/Base64URL encoder). If it's not valid Base64, treat the secret
        // as a plain UTF-8 string — many developers set JWT_SECRET to a raw passphrase.
        try {
            byte[] decoded = Decoders.BASE64URL.decode(base64Secret);
            // Only use the decoded bytes if they're long enough to be a real key.
            // A short decode result means the input was probably plain text, not Base64.
            if (decoded.length >= 32) {
                keyBytes = decoded;
            } else {
                // Fallback: treat the raw secret as UTF-8 bytes
                keyBytes = base64Secret.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            // Not valid Base64 — use as plain UTF-8 passphrase
            keyBytes = base64Secret.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        }

        if (keyBytes.length < 32) {
            throw new IllegalStateException(
                "JWT_SECRET is too short (" + keyBytes.length + " bytes after decoding). " +
                "Provide either: a plain string of at least 32 characters, " +
                "or a Base64-encoded key of at least 44 characters. " +
                "Generate a safe one with: openssl rand -base64 32");
        }

        cachedKey = Keys.hmacShaKeyFor(keyBytes);
    }

    public String generateToken(String email) {
        return Jwts.builder()
                .subject(email)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(cachedKey)
                .compact();
    }

    public String extractEmail(String token) {
        return extractAllClaims(token).getSubject();
    }

    /** Returns the expiry time of a token (used by the revocation blocklist). */
    public Date extractExpiration(String token) {
        return extractAllClaims(token).getExpiration();
    }

    public boolean isTokenValid(String token, UserDetails userDetails) {
        final String email = extractEmail(token);
        return email.equals(userDetails.getUsername()) && !isTokenExpired(token);
    }

    private boolean isTokenExpired(String token) {
        return extractAllClaims(token).getExpiration().before(new Date());
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(cachedKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
