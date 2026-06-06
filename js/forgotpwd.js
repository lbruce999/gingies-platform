// create button element variable
const button = document.getElementById('reset-btn');

// create emailInput element variable
const emailInput = document.getElementById('email-input');

// add event listener when button is clicked
button.addEventListener('click', () => {
    // store email text in variable
    let email = emailInput.value;
    console.log(email);
});