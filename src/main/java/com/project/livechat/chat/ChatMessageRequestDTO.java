package com.project.livechat.chat;


public record ChatMessageRequestDTO(
    String senderName,
    String content,
    MessageType type
) {
}
