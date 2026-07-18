package com.project.livechat.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ChatMessageRequestDTO(
    String sender,

    @NotBlank(message = "Message content is required")
    @Size(max = 2000, message = "Message must not exceed 2000 characters")
    String content,

    MessageType type,

    @NotNull(message = "Conversation ID is required")
    Integer conversationId
) {
}
