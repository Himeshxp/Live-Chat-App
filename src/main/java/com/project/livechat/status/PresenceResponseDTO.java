package com.project.livechat.status;

import java.time.Instant;

public record PresenceResponseDTO(
        String publicId,
        boolean online,
        Instant lastSeen
) {
}
