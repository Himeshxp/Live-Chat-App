package com.project.livechat.status;

import java.time.Instant;

public record PresenceEventDTO(
        String publicId,
        boolean online,
        Instant lastSeen
) {
}
