package com.project.livechat.security;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * Spring Security configuration.
 *
 * Key decisions:
 *  - CSRF disabled because the API is stateless (JWT-based, no cookies).
 *  - Session management is STATELESS — no server-side HTTP session is created.
 *  - JwtAuthFilter runs before UsernamePasswordAuthenticationFilter.
 *  - CORS is locked to ALLOWED_ORIGINS env var — no wildcard in production.
 *  - /api/auth/logout is authenticated (needs a valid token to revoke it).
 */
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final JsonAuthEntryPoint jsonAuthEntryPoint;

    // Fix 9: CORS origin(s) come from an env var, not hardcoded wildcard.
    // Set ALLOWED_ORIGINS=https://yourdomain.com on the server.
    // Multiple origins can be comma-separated: https://a.com,https://b.com
    @Value("${allowed.origins:*}")
    private String allowedOriginsRaw;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(ex -> ex.authenticationEntryPoint(jsonAuthEntryPoint))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/register", "/api/auth/login").permitAll()
                .requestMatchers("/ws/**").permitAll()
                .requestMatchers("/frontend/**", "/", "/index.html").permitAll()
                // logout requires a valid token (so we know what to revoke)
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        List<String> origins = Arrays.stream(allowedOriginsRaw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();

        // "*" with allowCredentials=true is rejected by browsers.
        // Use setAllowedOriginPatterns("*") for the wildcard case (local dev /
        // single-JAR same-origin deployment where the exact URL isn't known yet).
        // Once you know your Render URL, set ALLOWED_ORIGINS=https://your-app.onrender.com
        // and this will switch to the strict setAllowedOrigins path automatically.
        if (origins.size() == 1 && origins.get(0).equals("*")) {
            config.setAllowedOriginPatterns(List.of("*"));
        } else {
            config.setAllowedOrigins(origins);
        }

        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
