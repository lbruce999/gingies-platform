const supabaseClient = supabase.createClient(
    'https://aprupgrstpjwonossyuc.supabase.co',
    'sb_publishable_24E8FGSWUnvLbiA4X7qWIw_RROEQKaw'
)

console.log("Supabase client created");

console.log(supabaseClient);

const resetButton = document.getElementById("reset-btn");
const emailInput = document.getElementById("email-input");
const messageError = document.getElementById("error-msg");

resetButton.addEventListener("click", async function() {
    const email = emailInput.value.trim();
    if (!email){
        messageError.innerHTML = "Please enter a valid email address";
        return;
    }
    messageError.innerHTML = "✨ Sending reset email...";
    resetButton.disabled = true;

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password.html"
    });

    if (error) {
        console.log("Supabase reset error:", error.message);
        messageError.innerHTML = "Something went wrong. Please try again.";
        resetButton.disabled = false;
        return;
    }

    messageError.innerHTML = "Check your inbox for a password reset link.";
    resetButton.disabled = false;
});