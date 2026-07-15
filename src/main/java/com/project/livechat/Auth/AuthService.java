package com.project.livechat.Auth;

import com.project.livechat.entity.User;
import com.project.livechat.entity.UserRepository;
import com.project.livechat.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Handles user registration and login.
 *
 * Registration flow:
 *   1. Check for duplicate email → 409 if taken.
 *   2. BCrypt-hash the plaintext password.
 *   3. Assign a unique 8-character public ID.
 *   4. Persist the user, then return a JWT + profile info.
 *
 * Login flow:
 *   1. Look up user by email → 401 if not found.
 *   2. Verify BCrypt hash → 401 if mismatch.
 *   3. Return a fresh JWT + profile info.
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.findByEmail(request.email()).isPresent()) {
            throw new DuplicateEmailException("Email already registered: " + request.email());
        }

        User user = new User();
        user.setUsername(request.username());
        user.setEmail(request.email());
        user.setPassword(passwordEncoder.encode(request.password()));
        user.setPublicId(generateUniquePublicId());

        userRepository.save(user);

        String token = jwtService.generateToken(user.getEmail());
        return new AuthResponse(token, user.getUsername(), user.getPublicId(), user.getAvatarColor());
    }

    public AuthResponse login(AuthRequest request) {
        User user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new UsernameNotFoundException("No account found with email: " + request.email()));

        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new BadCredentialsException("Invalid password");
        }

        String token = jwtService.generateToken(user.getEmail());
        return new AuthResponse(token, user.getUsername(), user.getPublicId(), user.getAvatarColor());
    }

    /** Generates a random 8-character uppercase alphanumeric public ID, retrying until unique. */
    private String generateUniquePublicId() {
        String id;
        do {
            id = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        } while (userRepository.existsByPublicId(id));
        return id;
    }
}
