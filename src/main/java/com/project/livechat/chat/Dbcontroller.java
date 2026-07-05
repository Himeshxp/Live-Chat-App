package com.project.livechat.chat;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;

@RequiredArgsConstructor
@Controller
public class Dbcontroller {

    private final ChatService chatService;

}
