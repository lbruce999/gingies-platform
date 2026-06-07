// new password input
const passwordInput= document.getElementById("password");

// confirm password input
const confirmInput= document.getElementById("confirm-password");

// reset button submit
const resetButton= document.getElementById("update-password-btn");

// attach event listeners on reset password

resetButton.addEventListener("click", function(){
    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;
    console.log("password", confirmPassword);
    if (confirmPassword !== password) {
        alert("passwords don't match");
    }
});
