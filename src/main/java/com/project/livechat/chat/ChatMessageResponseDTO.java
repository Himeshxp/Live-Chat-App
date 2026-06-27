package com.project.livechat.chat;


import com.project.livechat.entity.User;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record ChatMessageResponseDTO(
       String senderName,
        String content,
        MessageType type,
        Instant timestamp
) {

}
