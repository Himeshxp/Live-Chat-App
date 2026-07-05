package com.project.livechat.chat;


import java.time.Instant;

public record ChatMessageResponseDTO(
       String sender,
        String senderPublicId,
        String content,
        MessageType type,
        Instant timestamp,
        Integer conversationId
) {

}
