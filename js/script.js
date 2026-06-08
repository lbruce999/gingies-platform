var LOGIN_PAGE_PATH = "loginPage.html";
var DASHBOARD_PAGE_PATH = "dashboard.html";
var FORGOT_PASSWORD_PAGE_PATH = "forgotpwd.html";
var apiClient = window.GingiesApi || null;

document.addEventListener("DOMContentLoaded", function () {
  initSiteNav();
  initQuoteForm();
  initSignupForm();
  initLoginForm();
  initForgotPasswordPage();
  initDashboardApp();
});

function hasSupabaseAuth() {
  return Boolean(
    apiClient &&
    typeof apiClient.isAuthConfigured === "function" &&
    apiClient.isAuthConfigured()
  );
}

function initSiteNav() {
  var navToggle = document.querySelector(".nav-toggle");
  var siteNav = document.querySelector(".site-nav");

  if (!navToggle || !siteNav) {
    return;
  }

  navToggle.addEventListener("click", function () {
    var isOpen = siteNav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      if (window.innerWidth <= 768) {
        siteNav.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 768) {
      siteNav.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });
}

function initQuoteForm() {
  var quoteForm = document.getElementById("quoteForm");
  var formMessage = document.getElementById("formMessage");

  if (!quoteForm || !formMessage) {
    return;
  }

  var steps = Array.prototype.slice.call(quoteForm.querySelectorAll(".intake-step"));
  var progressItems = Array.prototype.slice.call(document.querySelectorAll("[data-progress-step]"));
  var progressFill = document.getElementById("intakeProgressFill");
  var nextButton = document.getElementById("intakeNext");
  var backButton = document.getElementById("intakeBack");
  var submitButton = document.getElementById("intakeSubmit");
  var serviceInput = document.getElementById("serviceType");
  var serviceOptions = Array.prototype.slice.call(document.querySelectorAll(".service-option[data-service]"));

  if (!steps.length || !nextButton || !backButton || !submitButton || !serviceInput || !serviceOptions.length) {
    return;
  }

  var currentStep = 0;

  serviceOptions.forEach(function (button) {
    button.addEventListener("click", function () {
      serviceInput.value = button.getAttribute("data-service") || "";
      serviceOptions.forEach(function (option) {
        var isSelected = option === button;
        option.classList.toggle("selected", isSelected);
        option.setAttribute("aria-pressed", String(isSelected));
      });
      clearInvalid(document.getElementById("serviceOptions"));
      clearFormMessage(formMessage);
    });
  });

  nextButton.addEventListener("click", function () {
    if (!validateIntakeStep(quoteForm, currentStep, formMessage)) {
      focusFirstInvalid(quoteForm);
      return;
    }

    if (currentStep < steps.length - 1) {
      currentStep += 1;
      showIntakeStep(currentStep, steps, progressItems, progressFill, nextButton, backButton, submitButton);
    }
  });

  backButton.addEventListener("click", function () {
    if (currentStep > 0) {
      currentStep -= 1;
      showIntakeStep(currentStep, steps, progressItems, progressFill, nextButton, backButton, submitButton);
      clearFormMessage(formMessage);
    }
  });

  quoteForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!validateIntakeStep(quoteForm, currentStep, formMessage)) {
      focusFirstInvalid(quoteForm);
      return;
    }

    clearFormMessage(formMessage);
    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    var payload = buildServiceRequestPayload(quoteForm);

    try {
      var response = await submitServiceRequestToApi(payload);
      var requestId = response && response.serviceRequest && response.serviceRequest.id
        ? " Request ID: " + response.serviceRequest.id + "."
        : "";
      setFormMessage(formMessage, "Request received. Gingies will review the details and follow up." + requestId, "success");
      quoteForm.reset();
      resetServiceOptions(serviceOptions, serviceInput);
      currentStep = 0;
      showIntakeStep(currentStep, steps, progressItems, progressFill, nextButton, backButton, submitButton);
    } catch (error) {
      console.error("Failed to submit service request to API:", error);
      formMessage.textContent = getRequestErrorMessage(error, "We couldn't submit your request. Please try again.");
      formMessage.className = "form-message error";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit Service Request";
    }
  });

  showIntakeStep(currentStep, steps, progressItems, progressFill, nextButton, backButton, submitButton);
}

async function initSignupForm() {
  var signupForm = document.getElementById("signupForm");
  var signupMessage = document.getElementById("signupMessage");

  if (!signupForm || !signupMessage) {
    return;
  }

  if (!hasSupabaseAuth() || typeof apiClient.signup !== "function" || typeof apiClient.getCurrentSession !== "function") {
    setFormMessage(signupMessage, "Authentication is unavailable right now. Please try again later.", "error");
    return;
  }

  try {
    var existingSession = await apiClient.getCurrentSession();
    if (existingSession) {
      window.location.replace(DASHBOARD_PAGE_PATH);
      return;
    }
  } catch (error) {
    setFormMessage(signupMessage, getRequestErrorMessage(error, "Authentication is unavailable right now. Please try again later."), "error");
    return;
  }

  var username = document.getElementById("signupUsername");
  var email = document.getElementById("signupEmail");
  var password = document.getElementById("signupPassword");

  if (!username || !email || !password) {
    return;
  }

  signupForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    [username, email, password].forEach(clearInvalid);
    clearFormMessage(signupMessage);

    var hasError = false;
    if (!username.value.trim()) {
      markInvalid(username);
      hasError = true;
    }
    if (!email.value.trim() || !isValidEmail(email.value.trim())) {
      markInvalid(email);
      hasError = true;
    }
    if (password.value.length < 8) {
      markInvalid(password);
      hasError = true;
    }

    if (hasError) {
      setFormMessage(signupMessage, "Enter a username, a valid email, and a password with at least 8 characters.", "error");
      return;
    }

    var submitButton = signupForm.querySelector("button[type='submit']");
    var previousLabel = submitButton ? submitButton.textContent : "";

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Creating account...";
    }

    try {
      var result = await apiClient.signup({
        username: username.value.trim(),
        email: email.value.trim(),
        password: password.value
      });

      if (result && result.session) {
        setFormMessage(signupMessage, "Account created. Redirecting to your dashboard...", "success");
        window.setTimeout(function () {
          window.location.assign(DASHBOARD_PAGE_PATH);
        }, 350);
      } else {
        signupForm.reset();
        setFormMessage(signupMessage, "Account created. Check your email to confirm your account, then sign in.", "success");
      }
    } catch (error) {
      setFormMessage(signupMessage, getRequestErrorMessage(error, "Unable to create your account."), "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = previousLabel || "Create account";
      }
    }
  });
}

async function initLoginForm() {
  var loginForm = document.getElementById("loginForm");
  var loginMessage = document.getElementById("loginMessage");

  if (!loginForm || !loginMessage) {
    return;
  }

  if (!hasSupabaseAuth() || typeof apiClient.login !== "function" || typeof apiClient.getCurrentSession !== "function") {
    setFormMessage(loginMessage, "Authentication is unavailable right now. Please try again later.", "error");
    return;
  }

  try {
    var existingSession = await apiClient.getCurrentSession();
    if (existingSession) {
      window.location.replace(DASHBOARD_PAGE_PATH);
      return;
    }
  } catch (error) {
    setFormMessage(loginMessage, getRequestErrorMessage(error, "Authentication is unavailable right now. Please try again later."), "error");
    return;
  }

  var identifier = document.getElementById("identifier");
  var password = document.getElementById("password");

  if (!identifier || !password) {
    return;
  }

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    [identifier, password].forEach(clearInvalid);
    clearFormMessage(loginMessage);

    var hasError = false;
    if (!identifier.value.trim() || !isValidEmail(identifier.value.trim())) {
      markInvalid(identifier);
      hasError = true;
    }
    if (!password.value) {
      markInvalid(password);
      hasError = true;
    }

    if (hasError) {
      setFormMessage(loginMessage, "Enter your email address and password.", "error");
      return;
    }

    var submitButton = loginForm.querySelector("button[type='submit']");
    var previousLabel = submitButton ? submitButton.textContent : "";

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Signing in...";
    }

    try {
      await apiClient.login({
        email: identifier.value.trim(),
        password: password.value
      });

      setFormMessage(loginMessage, "Login successful. Redirecting...", "success");
      window.setTimeout(function () {
        window.location.assign(DASHBOARD_PAGE_PATH);
      }, 250);
    } catch (error) {
      setFormMessage(loginMessage, getRequestErrorMessage(error, "Unable to sign in."), "error");
      markInvalid(identifier);
      markInvalid(password);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = previousLabel || "Sign in";
      }
    }
  });
}

async function initForgotPasswordPage() {
  var requestForm = document.getElementById("forgotPasswordRequestForm");
  var requestMessage = document.getElementById("forgotPasswordRequestMessage");
  var requestPanel = document.getElementById("forgotPasswordRequestPanel");
  var resetForm = document.getElementById("forgotPasswordResetForm");
  var resetMessage = document.getElementById("forgotPasswordResetMessage");
  var resetPanel = document.getElementById("forgotPasswordResetPanel");
  var isResetOnlyPage = Boolean(resetForm && !requestForm);

  if (!requestForm && !resetForm) {
    return;
  }

  if (
    !hasSupabaseAuth() ||
    typeof apiClient.resetPassword !== "function" ||
    typeof apiClient.updatePassword !== "function" ||
    typeof apiClient.getCurrentSession !== "function"
  ) {
    if (requestMessage) {
      setFormMessage(requestMessage, "Authentication is unavailable right now. Please try again later.", "error");
    }
    if (resetMessage) {
      setFormMessage(resetMessage, "Authentication is unavailable right now. Please try again later.", "error");
    }
    return;
  }

  var isRecoveryMode = typeof apiClient.isRecoveryFlow === "function" && apiClient.isRecoveryFlow();
  var session = null;

  try {
    session = await apiClient.getCurrentSession();
  } catch (error) {
    if (requestMessage) {
      setFormMessage(requestMessage, getRequestErrorMessage(error, "Unable to load the password reset screen."), "error");
    }
    return;
  }

  if (isRecoveryMode || isResetOnlyPage) {
    if (session && resetPanel) {
      resetPanel.hidden = false;
    }
    if (requestPanel) {
      requestPanel.hidden = Boolean(session);
    }
    if (!session && requestMessage) {
      setFormMessage(requestMessage, "This recovery link is invalid or expired. Request a new password reset email below.", "error");
    }
    if (!session && resetMessage) {
      setFormMessage(resetMessage, "This recovery link is invalid or expired. Request a new password reset email.", "error");
    }
  }

  if (requestForm) {
    var emailField = document.getElementById("forgotPasswordEmail");

    requestForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (!emailField) {
        return;
      }

      clearInvalid(emailField);
      clearFormMessage(requestMessage);

      if (!emailField.value.trim() || !isValidEmail(emailField.value.trim())) {
        markInvalid(emailField);
        setFormMessage(requestMessage, "Enter a valid email address.", "error");
        return;
      }

      var submitButton = requestForm.querySelector("button[type='submit']");
      var previousLabel = submitButton ? submitButton.textContent : "";

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Sending reset link...";
      }

      try {
        await apiClient.resetPassword(emailField.value.trim());
        setFormMessage(requestMessage, "Check your email for a password reset link.", "success");
      } catch (error) {
        setFormMessage(requestMessage, getRequestErrorMessage(error, "Unable to send a password reset email."), "error");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = previousLabel || "Send reset link";
        }
      }
    });
  }

  if (resetForm) {
    var passwordField = document.getElementById("forgotPasswordNewPassword");

    resetForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (!passwordField) {
        return;
      }

      clearInvalid(passwordField);
      clearFormMessage(resetMessage);

      if (passwordField.value.length < 8) {
        markInvalid(passwordField);
        setFormMessage(resetMessage, "Enter a password with at least 8 characters.", "error");
        return;
      }

      var submitButton = resetForm.querySelector("button[type='submit']");
      var previousLabel = submitButton ? submitButton.textContent : "";

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Updating password...";
      }

      try {
        await apiClient.updatePassword(passwordField.value);
        setFormMessage(resetMessage, "Password updated. Redirecting to sign in...", "success");
        window.setTimeout(function () {
          window.location.assign(LOGIN_PAGE_PATH);
        }, 500);
      } catch (error) {
        setFormMessage(resetMessage, getRequestErrorMessage(error, "Unable to update your password."), "error");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = previousLabel || "Update password";
        }
      }
    });
  }
}

async function initDashboardApp() {
  var app = document.getElementById("dashboardApp");
  if (!app) {
    return;
  }

  var state = {
    assignedJobs: [],
    availableJobs: [],
    notifications: [],
    authUser: getCurrentAuthUser(),
    profile: null,
    loadError: ""
  };

  var elements = {
    app: app,
    loading: document.getElementById("dashboardLoading"),
    overlay: document.getElementById("dashboardOverlay"),
    sidebarToggle: document.getElementById("sidebarToggle"),
    sidebarLinks: Array.prototype.slice.call(document.querySelectorAll(".sidebar-link")),
    metricAvailable: document.getElementById("metricAvailableJobs"),
    metricActive: document.getElementById("metricActiveJobs"),
    metricScheduled: document.getElementById("metricScheduledJobs"),
    metricCompleted: document.getElementById("metricCompletedJobs"),
    sidebarAvailable: document.getElementById("sidebarAvailableCount"),
    sidebarScheduled: document.getElementById("sidebarScheduledCount"),
    sidebarUnread: document.getElementById("sidebarUnreadCount"),
    sidebarServiceArea: document.getElementById("sidebarServiceArea"),
    alertBadge: document.getElementById("topbarAlertBadge"),
    alertCount: document.getElementById("topbarAvailableCount"),
    tableBody: document.getElementById("requestsTableBody"),
    availableJobsList: document.getElementById("availableJobsList"),
    availableJobsCount: document.getElementById("availableJobsCount"),
    pipelineLists: Array.prototype.slice.call(document.querySelectorAll(".pipeline-list")),
    notificationsList: document.getElementById("notificationsList"),
    notificationsCount: document.getElementById("notificationsCount"),
    profileName: document.getElementById("profileName"),
    profileRating: document.getElementById("profileRating"),
    profileCompleted: document.getElementById("profileCompleted"),
    profileActive: document.getElementById("profileActive"),
    profileArea: document.getElementById("profileArea"),
    profileServices: document.getElementById("profileServices"),
    profileStatusBadge: document.getElementById("profileStatusBadge"),
    detailsModal: document.getElementById("detailsModal"),
    detailsClose: document.getElementById("detailsClose"),
    topbarUser: document.getElementById("topbarUser"),
    logoutButton: document.getElementById("logoutButton")
  };

  bindDashboardEvents(state, elements);

  if (!hasSupabaseAuth() || typeof apiClient.getCurrentSession !== "function") {
    state.loadError = "Supabase Auth is unavailable right now. Check your frontend auth configuration.";
    renderDashboard(state, elements);
    revealDashboard(elements);
    return;
  }

  try {
    var session = await apiClient.getCurrentSession();
    if (!session) {
      redirectToLogin();
      return;
    }
  } catch (error) {
    state.loadError = getRequestErrorMessage(error, "Unable to load your session.");
    renderDashboard(state, elements);
    revealDashboard(elements);
    return;
  }

  state.authUser = getCurrentAuthUser();

  await loadDashboardData(state, elements);
  revealDashboard(elements);
}

function showIntakeStep(stepIndex, steps, progressItems, progressFill, nextButton, backButton, submitButton) {
  steps.forEach(function (step, index) {
    var isActive = index === stepIndex;
    step.hidden = !isActive;
    step.classList.toggle("active", isActive);
  });

  progressItems.forEach(function (item, index) {
    item.classList.toggle("active", index === stepIndex);
    item.classList.toggle("complete", index < stepIndex);
  });

  if (progressFill) {
    progressFill.style.width = Math.round(((stepIndex + 1) / steps.length) * 100) + "%";
  }

  if (backButton) {
    backButton.hidden = stepIndex === 0;
  }

  if (nextButton) {
    nextButton.hidden = stepIndex === steps.length - 1;
    var labels = ["Next: Choose Service", "Next: Describe Project", "Next: Contact Info"];
    nextButton.textContent = labels[stepIndex] || "Next";
  }

  if (submitButton) {
    submitButton.hidden = stepIndex !== steps.length - 1;
  }
}

function validateIntakeStep(form, stepIndex, formMessage) {
  clearStepValidation(form);
  clearFormMessage(formMessage);

  if (stepIndex === 0) {
    return validateLocationStep(form, formMessage);
  }

  if (stepIndex === 1) {
    return validateServiceStep(form, formMessage);
  }

  if (stepIndex === 2) {
    return validateProjectStep(form, formMessage);
  }

  return validateContactStep(form, formMessage);
}

function validateLocationStep(form, formMessage) {
  var address = form.elements.address;
  var zipCode = form.elements.zipCode;
  var city = form.elements.city;
  var state = form.elements.state;
  var hasError = false;

  if (!getFieldValue(address) && !getFieldValue(zipCode)) {
    markInvalid(address);
    markInvalid(zipCode);
    hasError = true;
  }

  if (getFieldValue(zipCode) && !isValidZipCode(getFieldValue(zipCode))) {
    markInvalid(zipCode);
    hasError = true;
  }

  if (!getFieldValue(city)) {
    markInvalid(city);
    hasError = true;
  }

  if (state) {
    state.value = getFieldValue(state).toUpperCase();
  }

  if (!getFieldValue(state) || !/^[A-Z]{2}$/.test(getFieldValue(state))) {
    markInvalid(state);
    hasError = true;
  }

  if (hasError) {
    setFormMessage(formMessage, "Enter an address or ZIP code, plus city and 2-letter state.", "error");
  }

  return !hasError;
}

function validateServiceStep(form, formMessage) {
  var serviceType = form.elements.serviceType;
  var serviceOptions = document.getElementById("serviceOptions");

  if (!serviceType || !getFieldValue(serviceType)) {
    markInvalid(serviceOptions);
    setFormMessage(formMessage, "Choose a service category to continue.", "error");
    return false;
  }

  return true;
}

function validateProjectStep(form, formMessage) {
  var projectDescription = form.elements.projectDescription;
  var urgencyGroup = form.querySelector('[data-choice-group="urgency"]');
  var propertyGroup = form.querySelector('[data-choice-group="propertyType"]');
  var hasError = false;

  if (!getFieldValue(projectDescription) || getFieldValue(projectDescription).length < 3) {
    markInvalid(projectDescription);
    hasError = true;
  }

  if (!getCheckedValue(form, "urgency")) {
    markInvalid(urgencyGroup);
    hasError = true;
  }

  if (!getCheckedValue(form, "propertyType")) {
    markInvalid(propertyGroup);
    hasError = true;
  }

  if (hasError) {
    setFormMessage(formMessage, "Add project details, urgency, and property type.", "error");
  }

  return !hasError;
}

function validateContactStep(form, formMessage) {
  var firstName = form.elements.firstName;
  var lastName = form.elements.lastName;
  var phone = form.elements.phone;
  var email = form.elements.email;
  var contactGroup = form.querySelector('[data-choice-group="preferredContactMethod"]');
  var hasError = false;

  if (!getFieldValue(firstName)) {
    markInvalid(firstName);
    hasError = true;
  }

  if (!getFieldValue(lastName)) {
    markInvalid(lastName);
    hasError = true;
  }

  if (!getFieldValue(phone) || !/^[0-9+().\-\s]{7,30}$/.test(getFieldValue(phone))) {
    markInvalid(phone);
    hasError = true;
  }

  if (!getFieldValue(email) || !isValidEmail(getFieldValue(email))) {
    markInvalid(email);
    hasError = true;
  }

  if (!getCheckedValue(form, "preferredContactMethod")) {
    markInvalid(contactGroup);
    hasError = true;
  }

  if (hasError) {
    setFormMessage(formMessage, "Enter your contact details and preferred contact method.", "error");
  }

  return !hasError;
}

function buildServiceRequestPayload(form) {
  return {
    serviceType: getFieldValue(form.elements.serviceType),
    serviceSubtype: getOptionalValue(form.elements.serviceSubtype),
    address: getOptionalValue(form.elements.address),
    zipCode: getOptionalValue(form.elements.zipCode),
    city: getFieldValue(form.elements.city),
    state: getFieldValue(form.elements.state).toUpperCase(),
    firstName: getFieldValue(form.elements.firstName),
    lastName: getFieldValue(form.elements.lastName),
    phone: getFieldValue(form.elements.phone),
    email: getFieldValue(form.elements.email),
    preferredContactMethod: getCheckedValue(form, "preferredContactMethod"),
    projectDescription: getFieldValue(form.elements.projectDescription),
    urgency: getCheckedValue(form, "urgency"),
    propertyType: getCheckedValue(form, "propertyType")
  };
}

async function submitServiceRequestToApi(payload) {
  if (!apiClient || typeof apiClient.createServiceRequest !== "function") {
    throw new Error("Service request API is unavailable");
  }

  var response = await apiClient.createServiceRequest(payload);
  if (!response || !response.serviceRequest) {
    throw new Error("Service request API returned an invalid response");
  }

  return response;
}

function getFieldValue(field) {
  return field && typeof field.value === "string" ? field.value.trim() : "";
}

function getOptionalValue(field) {
  var value = getFieldValue(field);
  return value || undefined;
}

function getCheckedValue(form, name) {
  var checked = form.querySelector('input[name="' + name + '"]:checked');
  return checked ? checked.value : "";
}

function isValidZipCode(value) {
  return /^[0-9]{5}(-[0-9]{4})?$/.test(value);
}

function clearStepValidation(form) {
  Array.prototype.slice.call(form.querySelectorAll(".field-invalid")).forEach(function (item) {
    clearInvalid(item);
  });
}

function focusFirstInvalid(form) {
  var firstInvalid = form.querySelector(".field-invalid");
  var focusTarget = firstInvalid;

  if (!firstInvalid) {
    return;
  }

  if (firstInvalid.classList.contains("service-option-grid")) {
    focusTarget = firstInvalid.querySelector(".service-option");
  } else if (firstInvalid.classList.contains("choice-group")) {
    focusTarget = firstInvalid.querySelector("input");
  }

  if (focusTarget && typeof focusTarget.focus === "function") {
    focusTarget.focus();
  }
}

function resetServiceOptions(serviceOptions, serviceInput) {
  if (serviceInput) {
    serviceInput.value = "";
  }

  serviceOptions.forEach(function (button) {
    button.classList.remove("selected");
    button.setAttribute("aria-pressed", "false");
  });
}

async function loadDashboardData(state, elements) {
  try {
    state.loadError = "";

    var session = await apiClient.getCurrentUser();
    state.authUser = session && session.user ? session.user : getCurrentAuthUser();
    state.profile = session && session.profile ? session.profile : null;

    if (!state.authUser || state.authUser.role !== "contractor") {
      state.loadError = "This dashboard is available to contractor accounts only.";
      renderDashboard(state, elements);
      return;
    }

    var results = await Promise.all([
      apiClient.getContractorJobs(),
      apiClient.getAvailableContractorJobs(),
      apiClient.getContractorNotifications()
    ]);

    state.assignedJobs = normalizeJobList(results[0] && results[0].data, "assigned");
    state.availableJobs = normalizeJobList(results[1] && results[1].data, "available");
    state.notifications = normalizeNotifications(results[2] && results[2].data);
    renderDashboard(state, elements);
  } catch (error) {
    console.error("Failed to load dashboard data from API:", error);

    if (error && (error.status === 401 || error.status === 403)) {
      state.authUser = getCurrentAuthUser();
      state.profile = null;
      state.loadError = "Supabase login is working, but Render still needs to verify Supabase JWTs, map the Supabase user id, and provision local user rows before dashboard data can load.";
      renderDashboard(state, elements);
      return;
    }

    state.loadError = getRequestErrorMessage(error, "Unable to load dashboard data.");
    renderDashboard(state, elements);
  }
}

function bindDashboardEvents(state, elements) {
  if (elements.logoutButton) {
    elements.logoutButton.addEventListener("click", async function () {
      var previousLabel = elements.logoutButton.textContent;
      elements.logoutButton.disabled = true;
      elements.logoutButton.textContent = "Logging out...";

      try {
        if (apiClient && typeof apiClient.logout === "function") {
          await apiClient.logout();
        }
      } finally {
        redirectToLogin();
        elements.logoutButton.disabled = false;
        elements.logoutButton.textContent = previousLabel;
      }
    });
  }

  if (elements.sidebarToggle) {
    elements.sidebarToggle.addEventListener("click", function () {
      var isOpen = !elements.app.classList.contains("sidebar-open");
      setSidebarOpen(elements, isOpen);
    });
  }

  if (elements.overlay) {
    elements.overlay.addEventListener("click", function () {
      setSidebarOpen(elements, false);
    });
  }

  elements.sidebarLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      elements.sidebarLinks.forEach(function (item) {
        item.classList.remove("active");
      });
      link.classList.add("active");

      if (window.innerWidth <= 980) {
        setSidebarOpen(elements, false);
      }
    });
  });

  if (elements.tableBody) {
    elements.tableBody.addEventListener("click", function (event) {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      var button = event.target.closest("button[data-action]");
      if (!button || button.disabled) {
        return;
      }
      handleAssignedJobAction(state, elements, button);
    });
  }

  if (elements.availableJobsList) {
    elements.availableJobsList.addEventListener("click", function (event) {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      var button = event.target.closest("button[data-action]");
      if (!button || button.disabled) {
        return;
      }
      handleAvailableJobAction(state, elements, button);
    });
  }

  if (elements.notificationsList) {
    elements.notificationsList.addEventListener("click", function (event) {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      var button = event.target.closest("button[data-action='mark-notification-read']");
      if (!button || button.disabled) {
        return;
      }
      handleNotificationAction(state, elements, button);
    });
  }

  if (elements.detailsClose && elements.detailsModal) {
    elements.detailsClose.addEventListener("click", function () {
      closeDetailsModal(elements);
    });

    elements.detailsModal.addEventListener("click", function (event) {
      if (event.target === elements.detailsModal) {
        closeDetailsModal(elements);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeDetailsModal(elements);
      }
    });
  }

  window.addEventListener("resize", function () {
    if (window.innerWidth > 980) {
      setSidebarOpen(elements, false);
    }
  });
}

async function handleAssignedJobAction(state, elements, button) {
  var id = button.getAttribute("data-id");
  var action = button.getAttribute("data-action");
  var job = state.assignedJobs.find(function (item) {
    return item.id === id;
  });

  if (!job) {
    return;
  }

  if (action === "view") {
    openDetailsModal(elements, job);
    return;
  }

  var nextStatus = {
    schedule: "scheduled",
    start: "in_progress",
    complete: "completed"
  }[action];

  if (!nextStatus) {
    return;
  }

  await runDashboardAction(button, async function () {
    await apiClient.updateJobStatus(job.id, nextStatus);
    await loadDashboardData(state, elements);
  });
}

async function handleAvailableJobAction(state, elements, button) {
  var id = button.getAttribute("data-id");
  var action = button.getAttribute("data-action");
  var job = state.availableJobs.find(function (item) {
    return item.id === id;
  });

  if (!job) {
    return;
  }

  if (action === "view") {
    openDetailsModal(elements, job);
    return;
  }

  if (action !== "accept") {
    return;
  }

  await runDashboardAction(button, async function () {
    await apiClient.acceptJob(job.id);
    await loadDashboardData(state, elements);
  });
}

async function handleNotificationAction(state, elements, button) {
  var id = button.getAttribute("data-id");
  if (!id) {
    return;
  }

  await runDashboardAction(button, async function () {
    await apiClient.markContractorNotificationRead(id);
    await loadDashboardData(state, elements);
  });
}

async function runDashboardAction(button, action) {
  var previousText = button.textContent;
  button.disabled = true;
  button.textContent = "Working...";

  try {
    await action();
  } catch (error) {
    console.error("Dashboard action failed:", error);
    button.textContent = getRequestErrorMessage(error, "Action failed");
    window.setTimeout(function () {
      button.disabled = false;
      button.textContent = previousText;
    }, 1800);
    return;
  }

  button.disabled = false;
  button.textContent = previousText;
}

function setSidebarOpen(elements, isOpen) {
  elements.app.classList.toggle("sidebar-open", isOpen);
  if (elements.sidebarToggle) {
    elements.sidebarToggle.setAttribute("aria-expanded", String(isOpen));
  }
}

function openDetailsModal(elements, request) {
  if (!elements.detailsModal) {
    return;
  }

  var values = {
    name: request.customerName || "Customer details available after acceptance",
    service: request.serviceType,
    city: formatLocation(request),
    date: formatDate(request.createdAt),
    status: formatStatus(request.status),
    email: request.customerEmail || "Available after acceptance",
    phone: request.customerPhone || "Available after acceptance",
    details: request.description || "No project details provided."
  };

  Object.keys(values).forEach(function (key) {
    var slot = elements.detailsModal.querySelector('[data-detail="' + key + '"]');
    if (slot) {
      slot.textContent = values[key];
    }
  });

  elements.detailsModal.hidden = false;
}

function closeDetailsModal(elements) {
  if (elements.detailsModal) {
    elements.detailsModal.hidden = true;
  }
}

function renderDashboard(state, elements) {
  renderAuthenticatedUser(state, elements);
  renderMetrics(state, elements);
  renderSidebarIndicators(state, elements);
  renderAlertBadge(state, elements);
  renderContractorProfile(state, elements);
  renderAvailableJobs(state, elements);
  renderTable(state, elements);
  renderPipeline(state, elements);
  renderNotifications(state, elements);
}

function renderAuthenticatedUser(state, elements) {
  if (!elements.topbarUser) {
    return;
  }

  var user = state.authUser || getCurrentAuthUser();
  var label = "Account";

  if (user) {
    label = user.username || user.email || label;
  }

  elements.topbarUser.textContent = label;
}

function renderMetrics(state, elements) {
  var counts = getDashboardCounts(state);

  if (elements.metricAvailable) {
    elements.metricAvailable.textContent = String(counts.available);
  }
  if (elements.metricActive) {
    elements.metricActive.textContent = String(counts.active);
  }
  if (elements.metricScheduled) {
    elements.metricScheduled.textContent = String(counts.scheduled);
  }
  if (elements.metricCompleted) {
    elements.metricCompleted.textContent = String(counts.completed);
  }
}

function renderSidebarIndicators(state, elements) {
  var counts = getDashboardCounts(state);

  if (elements.sidebarAvailable) {
    elements.sidebarAvailable.textContent = String(counts.available);
  }
  if (elements.sidebarScheduled) {
    elements.sidebarScheduled.textContent = String(counts.scheduled);
  }
  if (elements.sidebarUnread) {
    elements.sidebarUnread.textContent = String(counts.unread);
  }
  if (elements.sidebarServiceArea) {
    elements.sidebarServiceArea.textContent = formatServiceArea(state.profile);
  }
}

function renderAlertBadge(state, elements) {
  if (!elements.alertBadge || !elements.alertCount) {
    return;
  }

  var counts = getDashboardCounts(state);
  elements.alertCount.textContent = String(counts.available);
  elements.alertBadge.classList.toggle("is-empty", counts.available === 0);
}

function renderContractorProfile(state, elements) {
  var profile = state.profile || {};
  var counts = getDashboardCounts(state);
  var services = Array.isArray(profile.services_offered) ? profile.services_offered : [];

  if (elements.profileName) {
    elements.profileName.textContent = profile.display_name || "Contractor";
  }
  if (elements.profileRating) {
    var rating = Number(profile.rating);
    elements.profileRating.textContent = Number.isFinite(rating) ? rating.toFixed(1) + " / 5.0" : "Not rated yet";
  }
  if (elements.profileCompleted) {
    elements.profileCompleted.textContent = String(profile.jobs_completed_base || 0);
  }
  if (elements.profileActive) {
    elements.profileActive.textContent = String(counts.active);
  }
  if (elements.profileArea) {
    elements.profileArea.textContent = formatServiceArea(profile);
  }
  if (elements.profileServices) {
    elements.profileServices.textContent = services.length ? services.join(", ") : "No services listed";
  }
  if (elements.profileStatusBadge) {
    elements.profileStatusBadge.textContent = formatStatus(profile.status || "active");
  }
}

function renderTable(state, elements) {
  if (!elements.tableBody) {
    return;
  }

  elements.tableBody.innerHTML = "";

  if (state.loadError) {
    appendEmptyTableRow(elements.tableBody, state.loadError);
    return;
  }

  var sorted = state.assignedJobs.slice().sort(function (a, b) {
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  if (sorted.length === 0) {
    appendEmptyTableRow(elements.tableBody, "No assigned jobs for this account yet.");
    return;
  }

  sorted.forEach(function (job) {
    var row = document.createElement("tr");

    row.appendChild(createTextCell(job.customerName || "Customer"));
    row.appendChild(createTextCell(job.serviceType));
    row.appendChild(createTextCell(formatLocation(job)));
    row.appendChild(createTextCell(formatDate(job.createdAt)));

    var statusCell = document.createElement("td");
    var statusBadge = document.createElement("span");
    statusBadge.className = "status-badge status-" + job.status;
    statusBadge.textContent = formatStatus(job.status);
    statusCell.appendChild(statusBadge);
    row.appendChild(statusCell);

    var actionsCell = document.createElement("td");
    var actionGroup = document.createElement("div");
    actionGroup.className = "action-group";

    actionGroup.appendChild(createActionButton("View", "action-view", "view", job.id, false));

    if (job.status === "accepted") {
      actionGroup.appendChild(createActionButton("Schedule", "action-schedule", "schedule", job.id, false));
    }
    if (job.status === "scheduled") {
      actionGroup.appendChild(createActionButton("Start", "action-schedule", "start", job.id, false));
    }
    if (job.status === "in_progress") {
      actionGroup.appendChild(createActionButton("Complete", "action-complete", "complete", job.id, false));
    }

    actionsCell.appendChild(actionGroup);
    row.appendChild(actionsCell);

    elements.tableBody.appendChild(row);
  });
}

function renderAvailableJobs(state, elements) {
  if (!elements.availableJobsList) {
    return;
  }

  elements.availableJobsList.innerHTML = "";

  var available = state.availableJobs.slice().sort(function (a, b) {
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  if (elements.availableJobsCount) {
    elements.availableJobsCount.textContent = available.length + " open";
  }

  if (available.length === 0) {
    var empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.loadError || "No available jobs assigned to this account right now.";
    elements.availableJobsList.appendChild(empty);
    return;
  }

  available.forEach(function (job) {
    var card = document.createElement("article");
    card.className = "available-job-card";

    card.innerHTML =
      "<div><span class='job-label'>Service</span><strong>" + escapeHtml(job.serviceType) + "</strong></div>" +
      "<div><span class='job-label'>Location</span><strong>" + escapeHtml(formatLocation(job)) + "</strong></div>" +
      "<div><span class='job-label'>Assigned</span><strong>" + escapeHtml(formatDate(job.assignment && job.assignment.assignedAt ? job.assignment.assignedAt : job.createdAt)) + "</strong></div>" +
      "<div><span class='job-label'>Estimated Value</span><strong>" + escapeHtml(formatEstimatedValue(job)) + "</strong></div>" +
      "<div><span class='job-label'>Distance</span><strong>" + escapeHtml(formatDistance(job.distanceMiles)) + "</strong></div>";

    var actionWrap = document.createElement("div");
    actionWrap.className = "available-action";

    actionWrap.appendChild(createActionButton("View", "action-view", "view", job.id, false));

    var button = document.createElement("button");
    button.type = "button";
    button.className = "available-accept-btn";
    button.textContent = "Accept Job";
    button.setAttribute("data-action", "accept");
    button.setAttribute("data-id", job.id);

    actionWrap.appendChild(button);
    card.appendChild(actionWrap);
    elements.availableJobsList.appendChild(card);
  });
}

function renderPipeline(state, elements) {
  var stageMap = {};
  elements.pipelineLists.forEach(function (list) {
    list.innerHTML = "";
    var stage = list.getAttribute("data-stage");
    if (stage) {
      stageMap[stage] = list;
    }
  });

  state.assignedJobs.forEach(function (job) {
    var list = stageMap[job.status];
    if (!list) {
      return;
    }

    var card = document.createElement("article");
    card.className = "pipeline-card status-" + job.status;

    card.innerHTML =
      "<strong>" + escapeHtml(job.customerName || "Customer") + "</strong>" +
      "<p>" + escapeHtml(job.serviceType) + " - " + escapeHtml(formatLocation(job)) + "</p>" +
      "<span class='pipeline-date'>" + formatDate(job.createdAt) + "</span>";

    list.appendChild(card);
  });

  elements.pipelineLists.forEach(function (list) {
    if (list.children.length === 0) {
      var empty = document.createElement("p");
      empty.className = "pipeline-empty";
      empty.textContent = "No jobs in this status";
      list.appendChild(empty);
    }
  });
}

function renderNotifications(state, elements) {
  if (!elements.notificationsList) {
    return;
  }

  elements.notificationsList.innerHTML = "";

  var unreadCount = state.notifications.filter(function (notification) {
    return !notification.read;
  }).length;

  if (elements.notificationsCount) {
    elements.notificationsCount.textContent = unreadCount + " unread";
  }

  if (state.notifications.length === 0) {
    var empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.loadError || "No backend notifications for this account.";
    elements.notificationsList.appendChild(empty);
    return;
  }

  state.notifications.forEach(function (notification) {
    var card = document.createElement("article");
    card.className = "notification-card";
    if (!notification.read) {
      card.classList.add("is-unread");
    }

    var message = document.createElement("p");
    message.textContent = notification.message;
    card.appendChild(message);

    var meta = document.createElement("div");
    meta.className = "notification-meta";
    meta.appendChild(document.createTextNode(formatDate(notification.createdAt)));

    if (!notification.read) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "dashboard-button notification-read-btn";
      button.textContent = "Mark read";
      button.setAttribute("data-action", "mark-notification-read");
      button.setAttribute("data-id", notification.id);
      meta.appendChild(button);
    }

    card.appendChild(meta);
    elements.notificationsList.appendChild(card);
  });
}

function createTextCell(value) {
  var cell = document.createElement("td");
  cell.textContent = value || "--";
  return cell;
}

function appendEmptyTableRow(tableBody, message) {
  var row = document.createElement("tr");
  var cell = document.createElement("td");
  cell.colSpan = 6;
  cell.className = "empty-state";
  cell.textContent = message;
  row.appendChild(cell);
  tableBody.appendChild(row);
}

function createActionButton(text, className, action, id, disabled) {
  var button = document.createElement("button");
  button.type = "button";
  button.className = "action-btn " + className;
  button.textContent = text;
  button.setAttribute("data-action", action);
  button.setAttribute("data-id", id);

  if (disabled) {
    button.disabled = true;
    button.classList.add("is-disabled");
  }

  return button;
}

function getCurrentAuthUser() {
  if (!apiClient) {
    return null;
  }

  if (typeof apiClient.getSessionUser === "function") {
    return apiClient.getSessionUser();
  }

  if (typeof apiClient.getStoredUser === "function") {
    return apiClient.getStoredUser();
  }

  return null;
}

function revealDashboard(elements) {
  if (elements.loading) {
    elements.loading.hidden = true;
  }

  if (elements.app) {
    elements.app.hidden = false;
  }
}

function redirectToLogin() {
  window.location.replace(LOGIN_PAGE_PATH);
}

function markInvalid(field) {
  if (!field) {
    return;
  }

  field.classList.add("field-invalid");
  field.setAttribute("aria-invalid", "true");
}

function clearInvalid(field) {
  if (!field) {
    return;
  }

  field.classList.remove("field-invalid");
  field.removeAttribute("aria-invalid");
}

function setFormMessage(element, message, type) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = "form-message " + type;
}

function clearFormMessage(element) {
  if (!element) {
    return;
  }

  element.textContent = "";
  element.className = "form-message";
}

function getRequestErrorMessage(error, fallback) {
  if (!error || typeof error.message !== "string") {
    return fallback;
  }

  return error.message.replace(/\s+\(HTTP \d+\)$/, "") || fallback;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatStatus(status) {
  if (status === "in_progress") {
    return "In Progress";
  }
  return status
    .split("_")
    .map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function formatDate(dateISO) {
  var date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function formatCurrency(amount) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function getDashboardCounts(state) {
  var active = state.assignedJobs.filter(function (job) {
    return job.status === "accepted" || job.status === "scheduled" || job.status === "in_progress";
  }).length;

  var scheduled = state.assignedJobs.filter(function (job) {
    return job.status === "scheduled";
  }).length;

  var completed = state.assignedJobs.filter(function (job) {
    return job.status === "completed";
  }).length;

  var unread = state.notifications.filter(function (notification) {
    return !notification.read;
  }).length;

  return {
    available: state.availableJobs.length,
    active: active,
    scheduled: scheduled,
    completed: completed,
    unread: unread
  };
}

function normalizeJobList(records, source) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map(function (record) {
    return normalizeJob(record, source);
  });
}

function normalizeJob(record, source) {
  var safe = record && typeof record === "object" ? record : {};
  return {
    id: safe.id ? String(safe.id) : "",
    customerName: safe.customerName ? String(safe.customerName) : "",
    customerEmail: safe.customerEmail ? String(safe.customerEmail) : "",
    customerPhone: safe.customerPhone ? String(safe.customerPhone) : "",
    serviceType: safe.serviceType ? String(safe.serviceType) : "Service",
    description: safe.description ? String(safe.description) : "",
    city: safe.city ? String(safe.city) : "",
    state: safe.state ? String(safe.state) : "",
    status: source === "available" ? "pending_assignment" : String(safe.status || ""),
    budgetMinCents: Number.isFinite(Number(safe.budgetMinCents)) ? Number(safe.budgetMinCents) : null,
    budgetMaxCents: Number.isFinite(Number(safe.budgetMaxCents)) ? Number(safe.budgetMaxCents) : null,
    estimatedValueCents: Number.isFinite(Number(safe.estimatedValueCents)) ? Number(safe.estimatedValueCents) : null,
    distanceMiles: Number.isFinite(Number(safe.distanceMiles)) ? Number(safe.distanceMiles) : null,
    createdAt: safe.createdAt || null,
    updatedAt: safe.updatedAt || null,
    scheduledAt: safe.scheduledAt || null,
    startedAt: safe.startedAt || null,
    completedAt: safe.completedAt || null,
    assignment: safe.assignment && typeof safe.assignment === "object" ? safe.assignment : null
  };
}

function normalizeNotifications(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map(function (record) {
    var safe = record && typeof record === "object" ? record : {};
    return {
      id: safe.id ? String(safe.id) : "",
      message: safe.message ? String(safe.message) : "Notification",
      type: safe.type ? String(safe.type) : "system_alert",
      read: Boolean(safe.read),
      createdAt: safe.created_at || safe.createdAt || null,
      jobId: safe.job_id || safe.jobId || null
    };
  });
}

function formatServiceArea(profile) {
  if (!profile) {
    return "--";
  }

  var city = profile.service_area_city || "";
  var state = profile.service_area_state || "";
  var area = [city, state].filter(Boolean).join(", ");
  return area || "--";
}

function formatLocation(job) {
  if (!job) {
    return "--";
  }

  return [job.city, job.state].filter(Boolean).join(", ") || "--";
}

function formatEstimatedValue(job) {
  if (Number.isFinite(job.estimatedValueCents) && job.estimatedValueCents > 0) {
    return formatCurrency(job.estimatedValueCents / 100);
  }

  if (Number.isFinite(job.budgetMinCents) && Number.isFinite(job.budgetMaxCents)) {
    return formatCurrency(job.budgetMinCents / 100) + " - " + formatCurrency(job.budgetMaxCents / 100);
  }

  if (Number.isFinite(job.budgetMinCents)) {
    return "From " + formatCurrency(job.budgetMinCents / 100);
  }

  if (Number.isFinite(job.budgetMaxCents)) {
    return "Up to " + formatCurrency(job.budgetMaxCents / 100);
  }

  return "Not provided";
}

function formatDistance(distanceMiles) {
  return Number.isFinite(distanceMiles) ? distanceMiles + " mi" : "Not available";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
