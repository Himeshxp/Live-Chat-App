package com.project.livechat.entity;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for PATCH /api/users/me.
 * Both fields are optional — send only the ones you want to change.
 */
public record UpdateProfileRequest(

        @Size(min = 3, max = 30, message = "Username must be between 3 and 30 characters")
        @Pattern(regexp = "^[a-zA-Z0-9_]*$", message = "Username can only contain letters, digits, and underscores")
        String username,   // null means "don't change"

        @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "avatarColor must be a valid hex color (e.g. #7C5CFF)")
        String avatarColor // null means "don't change"

) {}
