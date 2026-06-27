package com.project.livechat.Auth;


import com.project.livechat.entity.User;
import com.project.livechat.entity.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("api/auth")
@CrossOrigin(origins = "*")
public class AuthController {
    private final UserRepository userRepository;

    @PostMapping("/register")
    public User registerUser(@RequestBody User user){
        return userRepository.save(user);

    }

    @PostMapping("/login")
    public String login(@RequestParam String email, @RequestParam String password){
       User user= userRepository.findByEmail(email).orElse(null);
       if(user==null){
           return "User not found";
       }
       if(user.getPassword().equals(password)){
           return "Login Successful";
       }
       return "Invalid Password";
    }
}
