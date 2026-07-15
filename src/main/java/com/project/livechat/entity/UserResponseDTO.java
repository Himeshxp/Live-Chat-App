package com.project.livechat.entity;

/**
 * Read-only projection of a User sent to the client.
 * No validation annotations here — this is a response, not a request.
 */
public record UserResponseDTO(
        String username,
        String publicId,
        String email,
        String avatarColor   // hex string or null; frontend uses it for the avatar bubble
) {}
