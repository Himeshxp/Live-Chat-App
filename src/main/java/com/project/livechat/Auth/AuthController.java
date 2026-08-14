package com.project.livechat.Auth;

import com.project.livechat.security.JwtService;
import com.project.livechat.security.TokenBlocklist;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final RateLimiterService rateLimiterService;
    private final JwtService jwtService;
    private final TokenBlocklist tokenBlocklist;

    @PostMapping("/register")
    public ResponseEntity<?> register(
            @RequestBody @Valid RegisterRequest request,
            HttpServletRequest httpRequest
    ) {
        String ip = resolveClientIp(httpRequest);
        if (!rateLimiterService.tryConsumeRegister(ip)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("error", "Too many registration attempts. Please wait 15 minutes."));
        }
        AuthResponse response = authService.register(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @RequestBody @Valid AuthRequest request,
            HttpServletRequest httpRequest
    ) {
        String ip = resolveClientIp(httpRequest);
        if (!rateLimiterService.tryConsumeLogin(ip)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("error", "Too many login attempts. Please wait 10 minutes."));
        }
        return ResponseEntity.ok(authService.login(request));
    }

    /**
     * Logout: revokes the current JWT so it can't be reused even before expiry.
     * The frontend should also clear its localStorage on logout.
     */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(HttpServletRequest httpRequest) {
        String authHeader = httpRequest.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            try {
                tokenBlocklist.revoke(token, jwtService.extractExpiration(token));
            } catch (Exception ignored) {
                // Malformed token on logout — nothing to revoke, proceed silently
            }
        }
        return ResponseEntity.ok(Map.of("message", "Logged out successfully."));
    }

    /**
     * Resolves the real client IP.
     *
     * Fix 3 — IP spoofing: X-Forwarded-For is only trusted when the direct
     * TCP connection comes from a known trusted proxy (127.0.0.1 or ::1 for
     * local reverse-proxies like Nginx). Any other caller sending that header
     * is just a regular client trying to spoof their IP — we ignore it and
     * use remoteAddr, which cannot be faked at the TCP layer.
     */
    private String resolveClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();

        // Only trust proxy headers if the connection comes from localhost
        boolean fromTrustedProxy = "127.0.0.1".equals(remoteAddr) || "::1".equals(remoteAddr);

        if (fromTrustedProxy) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                // Header may contain a chain; leftmost entry is the original client
                return forwarded.split(",")[0].trim();
            }
            String realIp = request.getHeader("X-Real-IP");
            if (realIp != null && !realIp.isBlank()) {
                return realIp.trim();
            }
        }

        return remoteAddr;
    }
}
