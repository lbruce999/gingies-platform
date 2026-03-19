var STORAGE_KEY = "gingies.requests.v1";
var COUNTER_KEY = "gingies.requests.counter.v1";
var FALLBACK_COORDS = [40.4173, -82.9071];
var SERVICE_VALUES = {
  Plumbing: 850,
  Electrical: 780,
  Carpentry: 920,
  "General Repairs": 640
};
var CITY_COORDS = {
  columbus: [39.9612, -82.9988],
  dayton: [39.7589, -84.1916],
  cincinnati: [39.1031, -84.512],
  cleveland: [41.4993, -81.6944]
};
var STAGE_ORDER = ["new", "accepted", "scheduled", "in_progress", "completed"];
var CONTRACTOR_PROFILE = {
  name: "Vance Mercer",
  rating: 4.9,
  baseCompletedJobs: 124,
  serviceArea: "Greater Columbus Area",
  homeCity: "Columbus"
};
var LOGIN_PAGE_PATH = "loginPage.html";
var DASHBOARD_PAGE_PATH = "dashboard.html";

var storageAvailableCache = null;
var memoryStore = {
  requests: null,
  counter: 0
};
var apiClient = window.GingiesApi || null;

document.addEventListener("DOMContentLoaded", function () {
  initSiteNav();
  initQuoteForm();
  initSignupForm();
  initLoginForm();
  initDashboardApp();
});

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

  var fullName = document.getElementById("fullName");
  var email = document.getElementById("email");
  var phone = document.getElementById("phone");
  var city = document.getElementById("city");
  var serviceNeeded = document.getElementById("serviceNeeded");
  var details = document.getElementById("details");

  if (!fullName || !email || !city || !serviceNeeded || !details) {
    return;
  }

  quoteForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    var requiredFields = [fullName, email, city, serviceNeeded, details];
    var hasError = false;

    requiredFields.forEach(function (field) {
      clearInvalid(field);
      if (!field.value.trim()) {
        markInvalid(field);
        hasError = true;
      }
    });

    if (email.value.trim() && !isValidEmail(email.value.trim())) {
      markInvalid(email);
      hasError = true;
    }

    if (hasError) {
      formMessage.textContent = "Please complete all required fields with valid information.";
      formMessage.className = "form-message error";
      return;
    }

    var request = {
      id: nextRequestId(),
      remoteJobId: null,
      name: fullName.value.trim(),
      email: email.value.trim(),
      phone: phone ? phone.value.trim() : "",
      service: normalizeService(serviceNeeded.value.trim()),
      city: city.value.trim(),
      details: details.value.trim(),
      dateISO: new Date().toISOString(),
      status: "new"
    };
    var requests = ensureRequestStore();
    var submitButton = quoteForm.querySelector("button[type='submit']");
    var submittedToApi = false;
    var apiError = null;
    var previousButtonText = submitButton ? submitButton.textContent : "";

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Submitting...";
    }

    try {
      var syncedRequest = await submitQuoteToApi(request);
      if (syncedRequest) {
        request = syncedRequest;
        submittedToApi = true;
      }
    } catch (error) {
      apiError = error;
      console.error("Failed to submit quote to API:", error);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = previousButtonText || "Submit Request";
      }
    }

    requests.unshift(request);
    writeRequests(requests);

    if (submittedToApi) {
      formMessage.textContent = "Thanks. Your quote request was submitted successfully.";
      formMessage.className = "form-message success";
    } else if (apiError) {
      formMessage.textContent =
        "Your request was saved locally. Live server sync is temporarily unavailable.";
      formMessage.className = "form-message error";
    } else {
      formMessage.textContent = "Thanks. Your quote request was saved locally.";
      formMessage.className = "form-message success";
    }

    quoteForm.reset();
  });
}

function initSignupForm() {
  var signupForm = document.getElementById("signupForm");
  var signupMessage = document.getElementById("signupMessage");

  if (!signupForm || !signupMessage) {
    return;
  }

  if (!apiClient || typeof apiClient.signup !== "function") {
    setFormMessage(signupMessage, "Authentication is unavailable right now. Please try again later.", "error");
    return;
  }

  if (typeof apiClient.isAuthenticated === "function" && apiClient.isAuthenticated()) {
    window.location.replace(DASHBOARD_PAGE_PATH);
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
      await apiClient.signup({
        username: username.value.trim(),
        email: email.value.trim(),
        password: password.value
      });

      setFormMessage(signupMessage, "Account created. Redirecting to your dashboard...", "success");
      window.setTimeout(function () {
        window.location.assign(DASHBOARD_PAGE_PATH);
      }, 350);
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

function initLoginForm() {
  var loginForm = document.getElementById("loginForm");
  var loginMessage = document.getElementById("loginMessage");

  if (!loginForm || !loginMessage) {
    return;
  }

  if (!apiClient || typeof apiClient.login !== "function") {
    setFormMessage(loginMessage, "Authentication is unavailable right now. Please try again later.", "error");
    return;
  }

  if (typeof apiClient.isAuthenticated === "function" && apiClient.isAuthenticated()) {
    window.location.replace(DASHBOARD_PAGE_PATH);
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
    if (!identifier.value.trim()) {
      markInvalid(identifier);
      hasError = true;
    }
    if (!password.value) {
      markInvalid(password);
      hasError = true;
    }

    if (hasError) {
      setFormMessage(loginMessage, "Enter your email or username and password.", "error");
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
        identifier: identifier.value.trim(),
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

async function submitQuoteToApi(request) {
  if (!apiClient || typeof apiClient.createJob !== "function") {
    return null;
  }

  var response = await apiClient.createJob(toCreateJobPayload(request));
  if (!response || !response.job) {
    return null;
  }

  return toLocalRequestFromApiJob(response.job, request);
}

function toCreateJobPayload(request) {
  return {
    name: request.name,
    email: request.email,
    phone: request.phone || undefined,
    service: request.service,
    description: request.details,
    city: request.city
  };
}

function toLocalRequestFromApiJob(job, fallback) {
  var current = fallback && typeof fallback === "object" ? fallback : {};
  var remoteJobId = job && job.id ? String(job.id) : getRemoteJobId(current);
  var createdAt = toIsoDateOrFallback(job ? job.createdAt : null, current.dateISO);

  return {
    id: remoteJobId || (current.id ? String(current.id) : nextRequestId()),
    remoteJobId: remoteJobId || null,
    name: job && job.customerName ? String(job.customerName) : current.name || "Unknown Customer",
    email: job && job.customerEmail ? String(job.customerEmail) : current.email || "",
    phone: job && job.customerPhone ? String(job.customerPhone) : current.phone || "",
    service: normalizeService(job && job.serviceType ? String(job.serviceType) : current.service || "General Repairs"),
    city: job && job.city && String(job.city).trim() ? String(job.city).trim() : current.city || "Unknown",
    details: job && job.description ? String(job.description) : current.details || "",
    dateISO: createdAt,
    status: normalizeStatus(job && job.status ? String(job.status) : current.status || "new")
  };
}

function toIsoDateOrFallback(value, fallback) {
  var parsedValue = Date.parse(value || "");
  if (!Number.isNaN(parsedValue)) {
    return new Date(parsedValue).toISOString();
  }

  var parsedFallback = Date.parse(fallback || "");
  if (!Number.isNaN(parsedFallback)) {
    return new Date(parsedFallback).toISOString();
  }

  return new Date().toISOString();
}

function initDashboardApp() {
  var app = document.getElementById("dashboardApp");
  if (!app) {
    return;
  }

  if (!apiClient || typeof apiClient.getStoredToken !== "function" || !apiClient.getStoredToken()) {
    redirectToLogin();
    return;
  }

  var state = {
    requests: ensureRequestStore(),
    map: null,
    markerLayer: null,
    authUser: getCurrentAuthUser()
  };

  var elements = {
    app: app,
    loading: document.getElementById("dashboardLoading"),
    overlay: document.getElementById("dashboardOverlay"),
    sidebarToggle: document.getElementById("sidebarToggle"),
    sidebarLinks: Array.prototype.slice.call(document.querySelectorAll(".sidebar-link")),
    metricNew: document.getElementById("metricNewRequests"),
    metricScheduled: document.getElementById("metricScheduledJobs"),
    metricCompleted: document.getElementById("metricCompletedJobs"),
    metricRevenue: document.getElementById("metricWeeklyRevenue"),
    sidebarNew: document.getElementById("sidebarNewCount"),
    sidebarScheduled: document.getElementById("sidebarScheduledCount"),
    sidebarCompleted: document.getElementById("sidebarCompletedCount"),
    alertBadge: document.getElementById("topbarAlertBadge"),
    alertCount: document.getElementById("topbarNewAlertCount"),
    tableBody: document.getElementById("requestsTableBody"),
    availableJobsList: document.getElementById("availableJobsList"),
    pipelineLists: Array.prototype.slice.call(document.querySelectorAll(".pipeline-list")),
    notificationsList: document.getElementById("notificationsList"),
    mapContainer: document.getElementById("jobMap"),
    mapFallback: document.getElementById("mapFallback"),
    profileName: document.getElementById("profileName"),
    profileRating: document.getElementById("profileRating"),
    profileCompleted: document.getElementById("profileCompleted"),
    profileActive: document.getElementById("profileActive"),
    profileArea: document.getElementById("profileArea"),
    earningsToday: document.getElementById("earningsToday"),
    earningsWeek: document.getElementById("earningsWeek"),
    earningsMonth: document.getElementById("earningsMonth"),
    earningsPending: document.getElementById("earningsPending"),
    barToday: document.getElementById("barToday"),
    barWeek: document.getElementById("barWeek"),
    barMonth: document.getElementById("barMonth"),
    barPending: document.getElementById("barPending"),
    detailsModal: document.getElementById("detailsModal"),
    detailsClose: document.getElementById("detailsClose"),
    topbarUser: document.getElementById("topbarUser"),
    logoutButton: document.getElementById("logoutButton")
  };

  bindDashboardEvents(state, elements);
  renderDashboard(state, elements);
  hydrateDashboardSession(state, elements).finally(function () {
    if (!state.redirecting) {
      revealDashboard(elements);
    }
  });
  syncDashboardRequests(state, elements);
}

async function syncDashboardRequests(state, elements) {
  if (!apiClient || typeof apiClient.getJob !== "function") {
    return;
  }

  try {
    var syncResult = await syncRequestsFromApi(state.requests);
    if (!syncResult.changed) {
      return;
    }

    state.requests = syncResult.requests;
    writeRequests(state.requests);
    renderDashboard(state, elements);
  } catch (error) {
    console.error("Failed to sync dashboard data from API:", error);
  }
}

async function syncRequestsFromApi(requests) {
  if (!Array.isArray(requests) || requests.length === 0) {
    return {
      changed: false,
      requests: requests
    };
  }

  var candidates = requests
    .map(function (request, index) {
      var remoteJobId = getRemoteJobId(request);
      if (!remoteJobId || !request.email) {
        return null;
      }
      return {
        index: index,
        remoteJobId: remoteJobId,
        email: request.email
      };
    })
    .filter(Boolean);

  if (candidates.length === 0) {
    return {
      changed: false,
      requests: requests
    };
  }

  var results = await Promise.all(
    candidates.map(function (candidate) {
      return apiClient
        .getJob(candidate.remoteJobId, candidate.email)
        .then(function (payload) {
          return {
            candidate: candidate,
            payload: payload
          };
        })
        .catch(function () {
          return null;
        });
    })
  );

  var next = requests.slice();
  var changed = false;

  results.forEach(function (result) {
    if (!result || !result.payload || !result.payload.job) {
      return;
    }

    var current = next[result.candidate.index];
    if (!current) {
      return;
    }

    var updated = toLocalRequestFromApiJob(result.payload.job, current);
    if (JSON.stringify(updated) === JSON.stringify(current)) {
      return;
    }

    next[result.candidate.index] = updated;
    changed = true;
  });

  return {
    changed: changed,
    requests: next
  };
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
      handleRequestAction(state, elements, button.getAttribute("data-id"), button.getAttribute("data-action"));
    });
  }

  if (elements.availableJobsList) {
    elements.availableJobsList.addEventListener("click", function (event) {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      var button = event.target.closest("button[data-action='accept']");
      if (!button || button.disabled) {
        return;
      }
      handleRequestAction(state, elements, button.getAttribute("data-id"), "accept");
    });
  }

  elements.pipelineLists.forEach(function (list) {
    list.addEventListener("dragover", function (event) {
      event.preventDefault();
      list.classList.add("drop-target");
    });

    list.addEventListener("dragleave", function () {
      list.classList.remove("drop-target");
    });

    list.addEventListener("drop", function (event) {
      event.preventDefault();
      list.classList.remove("drop-target");
      var requestId = event.dataTransfer ? event.dataTransfer.getData("text/plain") : "";
      var stage = list.getAttribute("data-stage");
      if (!requestId || !stage) {
        return;
      }

      var request = state.requests.find(function (item) {
        return item.id === requestId;
      });

      if (!request || STAGE_ORDER.indexOf(stage) === -1 || request.status === stage) {
        return;
      }

      request.status = stage;
      writeRequests(state.requests);
      renderDashboard(state, elements);
    });
  });

  var pipelineBoard = document.getElementById("pipelineBoard");
  if (pipelineBoard) {
    pipelineBoard.addEventListener("dragstart", function (event) {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      var card = event.target.closest(".pipeline-card");
      if (!card || !card.getAttribute("data-id") || !event.dataTransfer) {
        return;
      }

      event.dataTransfer.setData("text/plain", card.getAttribute("data-id"));
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("is-dragging");
    });

    pipelineBoard.addEventListener("dragend", function (event) {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      var card = event.target.closest(".pipeline-card");
      if (card) {
        card.classList.remove("is-dragging");
      }
      elements.pipelineLists.forEach(function (list) {
        list.classList.remove("drop-target");
      });
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
    if (state.map) {
      state.map.invalidateSize();
    }
  });
}

function handleRequestAction(state, elements, id, action) {
  var request = state.requests.find(function (item) {
    return item.id === id;
  });

  if (!request) {
    return;
  }

  if (action === "view") {
    openDetailsModal(elements, request);
    return;
  }

  if (action === "accept" && request.status === "new") {
    request.status = "accepted";
  }

  if (action === "schedule" && (request.status === "new" || request.status === "accepted")) {
    request.status = "scheduled";
  }

  if (action === "complete" && request.status !== "completed" && request.status !== "new") {
    request.status = "completed";
  }

  writeRequests(state.requests);
  renderDashboard(state, elements);
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
    name: request.name,
    service: request.service,
    city: request.city,
    date: formatDate(request.dateISO),
    status: formatStatus(request.status),
    email: request.email,
    phone: request.phone || "Not provided",
    details: request.details || "No project details provided."
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
  renderMetrics(state.requests, elements);
  renderSidebarIndicators(state.requests, elements);
  renderAlertBadge(state.requests, elements);
  renderContractorProfile(state.requests, elements);
  renderEarnings(state.requests, elements);
  renderTable(state.requests, elements);
  renderAvailableJobs(state.requests, elements);
  renderPipeline(state.requests, elements);
  renderNotifications(state.requests, elements);
  renderMap(state, elements);
}

async function hydrateDashboardSession(state, elements) {
  if (!apiClient || typeof apiClient.getCurrentUser !== "function") {
    return;
  }

  try {
    var response = await apiClient.getCurrentUser();
    if (!response || !response.user) {
      return;
    }

    state.authUser = response.user;
    renderDashboard(state, elements);
  } catch (error) {
    console.error("Failed to load the current user session:", error);

    if (error && (error.status === 401 || error.status === 403)) {
      state.redirecting = true;
      if (apiClient && typeof apiClient.clearSession === "function") {
        apiClient.clearSession();
      }
      redirectToLogin();
    }
  }
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

function renderMetrics(requests, elements) {
  var counts = getStatusCounts(requests);
  var revenue = getWeeklyRevenue(requests);

  if (elements.metricNew) {
    elements.metricNew.textContent = String(counts.newCount);
  }
  if (elements.metricScheduled) {
    elements.metricScheduled.textContent = String(counts.scheduledCount);
  }
  if (elements.metricCompleted) {
    elements.metricCompleted.textContent = String(counts.completedCount);
  }
  if (elements.metricRevenue) {
    elements.metricRevenue.textContent = formatCurrency(revenue);
  }
}

function renderSidebarIndicators(requests, elements) {
  var counts = getStatusCounts(requests);

  if (elements.sidebarNew) {
    elements.sidebarNew.textContent = String(counts.newCount);
  }
  if (elements.sidebarScheduled) {
    elements.sidebarScheduled.textContent = String(counts.scheduledCount);
  }
  if (elements.sidebarCompleted) {
    elements.sidebarCompleted.textContent = String(counts.completedCount);
  }
}

function renderAlertBadge(requests, elements) {
  if (!elements.alertBadge || !elements.alertCount) {
    return;
  }

  var counts = getStatusCounts(requests);
  elements.alertCount.textContent = String(counts.newCount);
  elements.alertBadge.classList.toggle("is-empty", counts.newCount === 0);
}

function renderContractorProfile(requests, elements) {
  var completed = requests.filter(function (request) {
    return request.status === "completed";
  }).length;

  var active = requests.filter(function (request) {
    return request.status === "accepted" || request.status === "scheduled" || request.status === "in_progress";
  }).length;

  if (elements.profileName) {
    elements.profileName.textContent = CONTRACTOR_PROFILE.name;
  }
  if (elements.profileRating) {
    elements.profileRating.textContent = CONTRACTOR_PROFILE.rating.toFixed(1) + " / 5.0";
  }
  if (elements.profileCompleted) {
    elements.profileCompleted.textContent = String(CONTRACTOR_PROFILE.baseCompletedJobs + completed);
  }
  if (elements.profileActive) {
    elements.profileActive.textContent = String(active);
  }
  if (elements.profileArea) {
    elements.profileArea.textContent = CONTRACTOR_PROFILE.serviceArea;
  }
}

function renderEarnings(requests, elements) {
  var today = getTodayRevenue(requests);
  var week = getWeeklyRevenue(requests);
  var month = getMonthlyRevenue(requests);
  var pending = getPendingPayouts(requests);

  if (elements.earningsToday) {
    elements.earningsToday.textContent = formatCurrency(today);
  }
  if (elements.earningsWeek) {
    elements.earningsWeek.textContent = formatCurrency(week);
  }
  if (elements.earningsMonth) {
    elements.earningsMonth.textContent = formatCurrency(month);
  }
  if (elements.earningsPending) {
    elements.earningsPending.textContent = formatCurrency(pending);
  }

  var max = Math.max(today, week, month, pending, 1);
  setBarWidth(elements.barToday, today, max);
  setBarWidth(elements.barWeek, week, max);
  setBarWidth(elements.barMonth, month, max);
  setBarWidth(elements.barPending, pending, max);
}

function setBarWidth(bar, value, max) {
  if (!bar) {
    return;
  }

  var ratio = Math.max(0, Math.min(1, value / max));
  var width = value > 0 ? Math.max(8, Math.round(ratio * 100)) : 0;
  bar.style.width = width + "%";
}

function renderTable(requests, elements) {
  if (!elements.tableBody) {
    return;
  }

  elements.tableBody.innerHTML = "";

  var sorted = requests.slice().sort(function (a, b) {
    return Date.parse(b.dateISO) - Date.parse(a.dateISO);
  });

  sorted.forEach(function (request) {
    var row = document.createElement("tr");

    row.appendChild(createTextCell(request.name));
    row.appendChild(createTextCell(request.service));
    row.appendChild(createTextCell(request.city));
    row.appendChild(createTextCell(formatDate(request.dateISO)));

    var statusCell = document.createElement("td");
    var statusBadge = document.createElement("span");
    statusBadge.className = "status-badge status-" + request.status;
    statusBadge.textContent = formatStatus(request.status);
    statusCell.appendChild(statusBadge);
    row.appendChild(statusCell);

    var actionsCell = document.createElement("td");
    var actionGroup = document.createElement("div");
    actionGroup.className = "action-group";

    actionGroup.appendChild(createActionButton("View Details", "action-view", "view", request.id, false));
    actionGroup.appendChild(
      createActionButton("Accept", "action-accept", "accept", request.id, request.status !== "new")
    );

    var scheduleDisabled = !(request.status === "new" || request.status === "accepted");
    actionGroup.appendChild(
      createActionButton("Schedule", "action-schedule", "schedule", request.id, scheduleDisabled)
    );

    var completeDisabled = request.status === "completed" || request.status === "new";
    actionGroup.appendChild(
      createActionButton("Mark Complete", "action-complete", "complete", request.id, completeDisabled)
    );

    actionsCell.appendChild(actionGroup);
    row.appendChild(actionsCell);

    elements.tableBody.appendChild(row);
  });
}

function renderAvailableJobs(requests, elements) {
  if (!elements.availableJobsList) {
    return;
  }

  elements.availableJobsList.innerHTML = "";

  var available = requests
    .filter(function (request) {
      return request.status === "new";
    })
    .sort(function (a, b) {
      return Date.parse(b.dateISO) - Date.parse(a.dateISO);
    });

  if (available.length === 0) {
    var empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No open jobs right now. Check back soon.";
    elements.availableJobsList.appendChild(empty);
    return;
  }

  available.forEach(function (request) {
    var card = document.createElement("article");
    card.className = "available-job-card";

    var distance = getDistanceMiles(CONTRACTOR_PROFILE.homeCity, request.city);
    var budget = getBudgetRange(request.service);

    card.innerHTML =
      "<div><span class='job-label'>Customer</span><strong>" + escapeHtml(request.name) + "</strong></div>" +
      "<div><span class='job-label'>Service</span><strong>" + escapeHtml(request.service) + "</strong></div>" +
      "<div><span class='job-label'>Location</span><strong>" + escapeHtml(request.city) + "</strong></div>" +
      "<div><span class='job-label'>Distance</span><strong>" + distance + "</strong></div>" +
      "<div><span class='job-label'>Budget</span><strong>" + budget + "</strong></div>";

    var actionWrap = document.createElement("div");
    actionWrap.className = "available-action";

    var button = document.createElement("button");
    button.type = "button";
    button.className = "available-accept-btn";
    button.textContent = "Accept Job";
    button.setAttribute("data-action", "accept");
    button.setAttribute("data-id", request.id);

    actionWrap.appendChild(button);
    card.appendChild(actionWrap);
    elements.availableJobsList.appendChild(card);
  });
}

function renderPipeline(requests, elements) {
  var stageMap = {};
  elements.pipelineLists.forEach(function (list) {
    list.innerHTML = "";
    var stage = list.getAttribute("data-stage");
    if (stage) {
      stageMap[stage] = list;
    }
  });

  requests.forEach(function (request) {
    var list = stageMap[request.status];
    if (!list) {
      return;
    }

    var card = document.createElement("article");
    card.className = "pipeline-card status-" + request.status;
    card.setAttribute("draggable", "true");
    card.setAttribute("data-id", request.id);

    card.innerHTML =
      "<strong>" + escapeHtml(request.name) + "</strong>" +
      "<p>" + escapeHtml(request.service) + " - " + escapeHtml(request.city) + "</p>" +
      "<span class='pipeline-date'>" + formatDate(request.dateISO) + "</span>";

    list.appendChild(card);
  });

  elements.pipelineLists.forEach(function (list) {
    if (list.children.length === 0) {
      var empty = document.createElement("p");
      empty.className = "pipeline-empty";
      empty.textContent = "No jobs";
      list.appendChild(empty);
    }
  });
}

function renderNotifications(requests, elements) {
  if (!elements.notificationsList) {
    return;
  }

  elements.notificationsList.innerHTML = "";

  var newestNew = requests
    .filter(function (request) {
      return request.status === "new";
    })
    .sort(function (a, b) {
      return Date.parse(b.dateISO) - Date.parse(a.dateISO);
    })[0];

  var newestScheduled = requests
    .filter(function (request) {
      return request.status === "scheduled";
    })
    .sort(function (a, b) {
      return Date.parse(b.dateISO) - Date.parse(a.dateISO);
    })[0];

  var notifications = [];

  if (newestNew) {
    notifications.push("New " + newestNew.service.toLowerCase() + " request in " + newestNew.city + ".");
  }

  notifications.push("Customer message received.");

  if (newestScheduled) {
    notifications.push("Job scheduled for " + formatDate(newestScheduled.dateISO) + ".");
  } else {
    notifications.push("Job scheduled for tomorrow.");
  }

  notifications.slice(0, 4).forEach(function (message) {
    var card = document.createElement("article");
    card.className = "notification-card";
    card.textContent = message;
    elements.notificationsList.appendChild(card);
  });
}

function renderMap(state, elements) {
  if (!elements.mapContainer) {
    return;
  }

  if (!window.L) {
    if (elements.mapFallback) {
      elements.mapFallback.hidden = false;
      elements.mapFallback.textContent = "Map is temporarily unavailable. Job data is still visible in the table.";
    }
    return;
  }

  if (elements.mapFallback) {
    elements.mapFallback.hidden = true;
  }

  if (!state.map) {
    state.map = window.L.map(elements.mapContainer).setView(FALLBACK_COORDS, 7);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(state.map);
    state.markerLayer = window.L.layerGroup().addTo(state.map);
  }

  state.markerLayer.clearLayers();

  var bounds = [];
  state.requests.forEach(function (request) {
    var coords = getCityCoords(request.city);
    bounds.push(coords);

    window.L.circleMarker(coords, {
      radius: 8,
      fillColor: getStatusColor(request.status),
      color: "#ffffff",
      weight: 2,
      fillOpacity: 0.95
    })
      .bindPopup(
        "<strong>" + escapeHtml(request.name) + "</strong><br>" +
          escapeHtml(request.service) + "<br>" +
          escapeHtml(request.city) + "<br>" +
          formatStatus(request.status) + "<br>" +
          formatDate(request.dateISO)
      )
      .addTo(state.markerLayer);
  });

  if (bounds.length > 0) {
    state.map.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 9
    });
  } else {
    state.map.setView(FALLBACK_COORDS, 7);
  }

  setTimeout(function () {
    state.map.invalidateSize();
  }, 0);
}

function createTextCell(value) {
  var cell = document.createElement("td");
  cell.textContent = value;
  return cell;
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
  field.classList.add("field-invalid");
}

function clearInvalid(field) {
  field.classList.remove("field-invalid");
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

function getStatusCounts(requests) {
  return requests.reduce(
    function (acc, request) {
      if (request.status === "new") {
        acc.newCount += 1;
      }
      if (request.status === "scheduled") {
        acc.scheduledCount += 1;
      }
      if (request.status === "completed") {
        acc.completedCount += 1;
      }
      return acc;
    },
    {
      newCount: 0,
      scheduledCount: 0,
      completedCount: 0
    }
  );
}

function getTodayRevenue(requests) {
  var now = new Date();

  return requests.reduce(function (sum, request) {
    if (request.status !== "completed") {
      return sum;
    }

    var date = new Date(request.dateISO);
    if (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    ) {
      return sum + (SERVICE_VALUES[request.service] || 0);
    }

    return sum;
  }, 0);
}

function getWeeklyRevenue(requests) {
  var now = Date.now();
  var oneWeekMs = 7 * 24 * 60 * 60 * 1000;

  return requests.reduce(function (sum, request) {
    if (request.status !== "completed") {
      return sum;
    }

    var requestTime = Date.parse(request.dateISO);
    if (Number.isNaN(requestTime) || requestTime > now || now - requestTime > oneWeekMs) {
      return sum;
    }

    return sum + (SERVICE_VALUES[request.service] || 0);
  }, 0);
}

function getMonthlyRevenue(requests) {
  var now = Date.now();
  var monthMs = 30 * 24 * 60 * 60 * 1000;

  return requests.reduce(function (sum, request) {
    if (request.status !== "completed") {
      return sum;
    }

    var requestTime = Date.parse(request.dateISO);
    if (Number.isNaN(requestTime) || requestTime > now || now - requestTime > monthMs) {
      return sum;
    }

    return sum + (SERVICE_VALUES[request.service] || 0);
  }, 0);
}

function getPendingPayouts(requests) {
  return requests.reduce(function (sum, request) {
    if (request.status === "accepted" || request.status === "scheduled" || request.status === "in_progress") {
      return sum + Math.round((SERVICE_VALUES[request.service] || 0) * 0.65);
    }
    return sum;
  }, 0);
}

function normalizeService(service) {
  var allowed = ["Plumbing", "Electrical", "Carpentry", "General Repairs"];
  if (allowed.indexOf(service) === -1) {
    return "General Repairs";
  }
  return service;
}

function normalizeStatus(status) {
  if (STAGE_ORDER.indexOf(status) !== -1) {
    return status;
  }
  return "new";
}

function normalizeRequest(raw, index) {
  var safe = raw && typeof raw === "object" ? raw : {};
  var parsedDate = Date.parse(safe.dateISO);
  var id = safe.id ? String(safe.id) : "legacy-" + index + "-" + Date.now();
  var remoteJobId = "";

  if (safe.remoteJobId && isUuid(safe.remoteJobId)) {
    remoteJobId = String(safe.remoteJobId);
  } else if (isUuid(id)) {
    remoteJobId = id;
  }

  return {
    id: id,
    remoteJobId: remoteJobId || null,
    name: safe.name ? String(safe.name) : "Unknown Customer",
    email: safe.email ? String(safe.email) : "",
    phone: safe.phone ? String(safe.phone) : "",
    service: normalizeService(safe.service ? String(safe.service) : "General Repairs"),
    city: safe.city && String(safe.city).trim() ? String(safe.city).trim() : "Unknown",
    details: safe.details ? String(safe.details) : "",
    dateISO: Number.isNaN(parsedDate) ? new Date().toISOString() : new Date(parsedDate).toISOString(),
    status: normalizeStatus(safe.status ? String(safe.status) : "new")
  };
}

function normalizeRequests(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map(function (record, index) {
    return normalizeRequest(record, index);
  });
}

function ensureRequestStore() {
  var stored = readRequests();
  var requests;

  if (!Array.isArray(stored) || stored.length === 0) {
    requests = createSeedRequests();
  } else {
    requests = normalizeRequests(stored);
  }

  writeRequests(requests);

  if (readCounter() < requests.length) {
    writeCounter(requests.length);
  }

  return requests;
}

function createSeedRequests() {
  var now = new Date();

  function daysAgoISO(days) {
    var date = new Date(now);
    date.setDate(now.getDate() - days);
    return date.toISOString();
  }

  return [
    {
      id: "seed-1",
      name: "John Smith",
      email: "john@example.com",
      phone: "",
      service: "Plumbing",
      city: "Columbus",
      details: "Kitchen sink leak and faucet replacement.",
      dateISO: daysAgoISO(0),
      status: "new"
    },
    {
      id: "seed-2",
      name: "Angela Ruiz",
      email: "angela@example.com",
      phone: "",
      service: "Electrical",
      city: "Dayton",
      details: "Install two pendant lights and troubleshoot switch.",
      dateISO: daysAgoISO(1),
      status: "scheduled"
    },
    {
      id: "seed-3",
      name: "Mark Lee",
      email: "mark@example.com",
      phone: "",
      service: "Carpentry",
      city: "Cincinnati",
      details: "Build custom wall shelf in home office.",
      dateISO: daysAgoISO(2),
      status: "completed"
    },
    {
      id: "seed-4",
      name: "Rachel Adams",
      email: "rachel@example.com",
      phone: "",
      service: "General Repairs",
      city: "Cleveland",
      details: "Repair interior door and patch hallway drywall.",
      dateISO: daysAgoISO(3),
      status: "new"
    }
  ];
}

function nextRequestId() {
  var counter = readCounter() + 1;
  writeCounter(counter);
  return "req-" + counter + "-" + Date.now();
}

function readRequests() {
  if (hasLocalStorage()) {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  return memoryStore.requests;
}

function writeRequests(requests) {
  if (hasLocalStorage()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
      return;
    } catch (error) {
      memoryStore.requests = requests;
      return;
    }
  }

  memoryStore.requests = requests;
}

function readCounter() {
  if (hasLocalStorage()) {
    try {
      var raw = window.localStorage.getItem(COUNTER_KEY);
      var parsed = parseInt(raw || "0", 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    } catch (error) {
      return memoryStore.counter;
    }
  }

  return memoryStore.counter;
}

function writeCounter(value) {
  if (hasLocalStorage()) {
    try {
      window.localStorage.setItem(COUNTER_KEY, String(value));
      return;
    } catch (error) {
      memoryStore.counter = value;
      return;
    }
  }

  memoryStore.counter = value;
}

function hasLocalStorage() {
  if (storageAvailableCache !== null) {
    return storageAvailableCache;
  }

  try {
    var key = "__gingies_storage_test__";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    storageAvailableCache = true;
  } catch (error) {
    storageAvailableCache = false;
  }

  return storageAvailableCache;
}

function getRemoteJobId(request) {
  if (!request || typeof request !== "object") {
    return "";
  }

  if (request.remoteJobId && isUuid(request.remoteJobId)) {
    return String(request.remoteJobId);
  }

  if (request.id && isUuid(request.id)) {
    return String(request.id);
  }

  return "";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function getCityCoords(city) {
  if (!city) {
    return FALLBACK_COORDS;
  }

  var key = city.toLowerCase().trim();
  if (CITY_COORDS[key]) {
    return CITY_COORDS[key];
  }

  var match = Object.keys(CITY_COORDS).find(function (known) {
    return key.indexOf(known) !== -1;
  });

  return match ? CITY_COORDS[match] : FALLBACK_COORDS;
}

function getDistanceMiles(fromCity, toCity) {
  var from = getCityCoords(fromCity);
  var to = getCityCoords(toCity);
  var miles = haversineMiles(from[0], from[1], to[0], to[1]);

  if (!Number.isFinite(miles)) {
    return "--";
  }

  return Math.round(miles) + " mi";
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  var toRad = function (value) {
    return (value * Math.PI) / 180;
  };

  var earthRadiusMiles = 3958.8;
  var dLat = toRad(lat2 - lat1);
  var dLon = toRad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function getBudgetRange(service) {
  var base = SERVICE_VALUES[service] || 700;
  var min = Math.round((base * 0.85) / 10) * 10;
  var max = Math.round((base * 1.15) / 10) * 10;
  return formatCurrency(min) + " - " + formatCurrency(max);
}

function getStatusColor(status) {
  if (status === "accepted") {
    return "#4f6bed";
  }
  if (status === "scheduled") {
    return "#2f80ed";
  }
  if (status === "in_progress") {
    return "#7c5cff";
  }
  if (status === "completed") {
    return "#1f7a3e";
  }
  return "#f08b2c";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
