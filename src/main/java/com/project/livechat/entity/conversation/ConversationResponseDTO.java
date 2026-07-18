package com.project.livechat.entity.conversation;

import java.time.Instant;

/**
 * Sent to the frontend when listing or creating conversations.
 * avatarColor fields allow the frontend to render coloured avatars without
 * a separate user-profile fetch, and are used to correctly identify message
 * ownership (isMine check in app.js uses senderPublicId, not username).
 */
public record ConversationResponseDTO(
        Integer id,
        String participant1Username,
        String participant1PublicId,
        String participant1AvatarColor,   // may be null if user hasn't set one
        String participant2Username,
        String participant2PublicId,
        String participant2AvatarColor,   // may be null if user hasn't set one
        Instant createdAt
) {}
