package com.project.livechat.entity.conversation;

import java.time.Instant;

public record ConversationResponseDTO(
        Integer id,
        String participant1Username,
        String participant1PublicId,
        String participant2Username,
        String participant2PublicId,
        Instant createdAt
) {
}
