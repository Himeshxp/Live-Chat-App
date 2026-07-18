package com.project.livechat.entity;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Business logic for user lookups and profile updates.
 */
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository repo;

    /** Fetch a user's public profile by their public ID. */
    public UserResponseDTO findByPublicId(String publicId) {
        return repo.findByPublicId(publicId)
                .map(this::toResponse)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + publicId));
    }

    /** Fetch the currently-authenticated user's full profile by email. */
    public UserResponseDTO findByEmail(String email) {
        return repo.findByEmail(email)
                .map(this::toResponse)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + email));
    }

    /**
     * Partially update username and/or avatarColor.
     * Only non-null fields in the request are applied.
     */
    @Transactional
    public UserResponseDTO updateProfile(String email, UpdateProfileRequest request) {
        User user = repo.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + email));

        if (request.username() != null && !request.username().isBlank()) {
            user.setUsername(request.username());
        }
        if (request.avatarColor() != null && !request.avatarColor().isBlank()) {
            user.setAvatarColor(request.avatarColor());
        }

        return toResponse(repo.save(user));
    }

    private UserResponseDTO toResponse(User u) {
        return new UserResponseDTO(u.getUsername(), u.getPublicId(), u.getAvatarColor());
    }
}
