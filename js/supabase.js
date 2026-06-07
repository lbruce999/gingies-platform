// Create supabase client with project URL and Publishable key
const supabaseClient = supabase.createClient(
    'https://aprupgrstpjwonossyuc.supabase.co',
    'sb_publishable_24E8FGSWUnvLbiA4X7qWIw_RROEQKaw'
)

console.log("Supabase client created");

console.log(supabaseClient);

//  Login in form full element
const loginForm = document.getElementById("loginForm");

// Pmail input element
const email = document.getElementById("identifier");

// Password input element
const password = document.getElementById("password");

// If login form is not empty add an eventlistener to the submit button
if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
        // stop form from refreshing until the async submit form comes through
        event.preventDefault();

        console.log(email.value);

        console.log(password.value);
        // create the sign in with password using the value
        const { data, error } = await supabaseClient.auth.signInWithPassword({

            email: email.value.trim(),

            password: password.value

        });

        if (error) {

            console.error(error.message);

            return;

        }

        console.log("Logged in:", data);
        window.location.assign("/dashboard.html");

    });
}