package com.project.livechat.chat;


public record ChatMessageRequestDTO(
    String sender,
    String content,
    MessageType type,
    Integer conversationId
) {
}
