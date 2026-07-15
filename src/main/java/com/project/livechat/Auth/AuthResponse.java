package com.project.livechat.Auth;

/**
 * Returned by /api/auth/register and /api/auth/login on success.
 * The client stores the token and uses it in every subsequent request
 * as:  Authorization: Bearer <token>
 */
public record AuthResponse(
        String token,
        String username,
        String publicId,
        String avatarColor  // may be null until the user picks one in their profile
) {}
