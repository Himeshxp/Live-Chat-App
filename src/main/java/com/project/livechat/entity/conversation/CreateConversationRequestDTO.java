package com.project.livechat.entity.conversation;

public record CreateConversationRequestDTO(
        String currentUser,
        String otherPublicId
) {
}
