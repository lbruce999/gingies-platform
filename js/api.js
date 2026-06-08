(function (global) {
  var PRODUCTION_API_BASE = "https://gingies-api.onrender.com";
  var LOCAL_API_BASE = "http://localhost:4000";
  var LOCAL_HOSTS = ["localhost", "127.0.0.1"];
  var TOKEN_STORAGE_KEY = "gingies.auth.token";
  var USER_STORAGE_KEY = "gingies.auth.user";
  var PASSWORD_RESET_PAGE_PATH = "reset-password.html";
  var SIGNUP_REDIRECT_PATH = "dashboard.html";

  var authClient = createAuthClient();
  var authBootstrapPromise = authClient
    ? authClient.auth.getSession().then(function (result) {
      if (result && result.error) {
        return null;
      }
      return setCachedSession(result && result.data ? result.data.session : null);
    }).catch(function () {
      return null;
    })
    : Promise.resolve(null);
  var cachedSession = null;
  var cachedRenderUser = null;

  if (authClient) {
    authClient.auth.onAuthStateChange(function (_event, session) {
      setCachedSession(session || null);
    });
  }

  function isLocalHost(hostname) {
    if (!hostname) {
      return false;
    }
    return LOCAL_HOSTS.indexOf(hostname) !== -1;
  }

  function resolveApiBase() {
    var override = global.__GINGIES_API_BASE_URL__;
    if (typeof override === "string" && override.trim()) {
      return override.trim().replace(/\/+$/, "");
    }

    var host = global.location && global.location.hostname ? global.location.hostname : "";
    if (isLocalHost(host)) {
      return LOCAL_API_BASE;
    }

    return PRODUCTION_API_BASE;
  }

  function createAuthClient() {
    var supabaseLib = global.supabase;
    var supabaseUrl = global.__GINGIES_SUPABASE_URL__;
    var supabaseAnonKey = global.__GINGIES_SUPABASE_ANON_KEY__;

    if (!supabaseLib || typeof supabaseLib.createClient !== "function") {
      return null;
    }

    if (typeof supabaseUrl !== "string" || !supabaseUrl.trim()) {
      return null;
    }

    if (typeof supabaseAnonKey !== "string" || !supabaseAnonKey.trim()) {
      return null;
    }

    return supabaseLib.createClient(supabaseUrl.trim(), supabaseAnonKey.trim());
  }

  function parseResponseBody(response) {
    var contentType = response.headers.get("content-type") || "";
    if (contentType.indexOf("application/json") === -1) {
      return response.text();
    }
    return response.json();
  }

  async function apiRequest(path, options) {
    if (!path || path.charAt(0) !== "/") {
      throw new Error("API path must start with '/'");
    }

    var requestOptions = options ? Object.assign({}, options) : {};
    var headers = requestOptions.headers ? Object.assign({}, requestOptions.headers) : {};
    var hasBody = requestOptions.body !== undefined && requestOptions.body !== null;
    var isFormData = typeof FormData !== "undefined" && requestOptions.body instanceof FormData;

    if (hasBody && !isFormData && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    if (!headers.Accept) {
      headers.Accept = "application/json";
    }

    requestOptions.headers = headers;
    requestOptions.mode = requestOptions.mode || "cors";

    var response = await fetch(resolveApiBase() + path, requestOptions);
    var responseBody = await parseResponseBody(response);

    if (!response.ok) {
      var message = "Request failed";
      if (responseBody && typeof responseBody === "object") {
        if (typeof responseBody.error === "string") {
          message = responseBody.error;
        } else if (responseBody.error && typeof responseBody.error.message === "string") {
          message = responseBody.error.message;
        } else if (typeof responseBody.message === "string") {
          message = responseBody.message;
        }
      }
      var error = new Error(message + " (HTTP " + response.status + ")");
      error.status = response.status;
      error.payload = responseBody;
      throw error;
    }

    return responseBody;
  }

  function getStorage() {
    try {
      return global.localStorage || null;
    } catch (_error) {
      return null;
    }
  }

  function clearLegacySession() {
    var storage = getStorage();
    if (!storage) {
      return;
    }

    storage.removeItem(TOKEN_STORAGE_KEY);
    storage.removeItem(USER_STORAGE_KEY);
  }

  function createAuthError(message) {
    return new Error(message || "Authentication is unavailable right now.");
  }

  function getAbsoluteUrl(path) {
    try {
      return new URL(path, global.location.href).toString();
    } catch (_error) {
      return path;
    }
  }

  function isAuthConfigured() {
    return Boolean(authClient);
  }

  function setCachedSession(session) {
    cachedSession = session || null;
    if (!cachedSession) {
      cachedRenderUser = null;
      clearLegacySession();
    }
    return cachedSession;
  }

  function normalizeRenderUser(user) {
    if (!user || typeof user !== "object") {
      return null;
    }

    return {
      id: user.id || null,
      email: user.email || "",
      username: user.username || "",
      role: user.role || null
    };
  }

  function normalizeSupabaseUser(user) {
    if (!user || typeof user !== "object") {
      return null;
    }

    var userMetadata = user.user_metadata && typeof user.user_metadata === "object"
      ? user.user_metadata
      : {};
    var appMetadata = user.app_metadata && typeof user.app_metadata === "object"
      ? user.app_metadata
      : {};
    var username = typeof userMetadata.username === "string" && userMetadata.username.trim()
      ? userMetadata.username.trim()
      : "";
    var role = null;

    if (typeof userMetadata.role === "string" && userMetadata.role.trim()) {
      role = userMetadata.role.trim();
    } else if (
      typeof appMetadata.role === "string" &&
      appMetadata.role.trim() &&
      appMetadata.role !== "authenticated"
    ) {
      role = appMetadata.role.trim();
    }

    return {
      id: user.id || null,
      email: user.email || "",
      username: username || user.email || "",
      role: role
    };
  }

  async function getCurrentSession() {
    if (!authClient) {
      return null;
    }

    await authBootstrapPromise;

    var result = await authClient.auth.getSession();
    if (result && result.error) {
      throw createAuthError(result.error.message || "Unable to load your session.");
    }

    return setCachedSession(result && result.data ? result.data.session : null);
  }

  async function getAuthHeader(headers) {
    var nextHeaders = headers ? Object.assign({}, headers) : {};
    var session = await getCurrentSession();

    if (session && session.access_token) {
      nextHeaders.Authorization = "Bearer " + session.access_token;
    }

    return nextHeaders;
  }

  async function authApiRequest(path, options) {
    var requestOptions = options ? Object.assign({}, options) : {};
    requestOptions.headers = await getAuthHeader(requestOptions.headers);
    return apiRequest(path, requestOptions);
  }

  function getStoredToken() {
    return cachedSession && cachedSession.access_token ? cachedSession.access_token : "";
  }

  function getStoredUser() {
    return cachedRenderUser || getSessionUser();
  }

  function setStoredUser(user) {
    cachedRenderUser = normalizeRenderUser(user);
    return cachedRenderUser;
  }

  function clearSession() {
    cachedRenderUser = null;
    setCachedSession(null);
  }

  function getSessionUser() {
    if (!cachedSession || !cachedSession.user) {
      return null;
    }

    return normalizeSupabaseUser(cachedSession.user);
  }

  function isAuthenticated() {
    return Boolean(getStoredToken());
  }

  function isRecoveryFlow() {
    var search = global.location && global.location.search ? global.location.search : "";
    var hash = global.location && global.location.hash ? global.location.hash : "";
    var urlBits = search + "&" + hash;
    return /type=recovery|access_token=|refresh_token=|token_hash=|code=/.test(urlBits);
  }

  function createJob(payload) {
    return apiRequest("/api/jobs", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  function createServiceRequest(payload) {
    return apiRequest("/api/service-requests", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  function getJob(jobId, email) {
    var query = "";
    if (email) {
      query = "?email=" + encodeURIComponent(email);
    }
    return apiRequest("/api/jobs/" + encodeURIComponent(jobId) + query);
  }

  function getContractorJobs() {
    return authApiRequest("/api/contractor/jobs");
  }

  function getAvailableContractorJobs() {
    return authApiRequest("/api/contractor/jobs/available");
  }

  function getContractorNotifications() {
    return authApiRequest("/api/contractor/notifications");
  }

  function acceptJob(jobId) {
    return authApiRequest("/api/jobs/" + encodeURIComponent(jobId) + "/accept", {
      method: "POST"
    });
  }

  function updateJobStatus(jobId, status) {
    return authApiRequest("/api/jobs/" + encodeURIComponent(jobId) + "/status", {
      method: "PATCH",
      body: JSON.stringify({
        status: status
      })
    });
  }

  function markContractorNotificationRead(notificationId) {
    return authApiRequest("/api/contractor/notifications/" + encodeURIComponent(notificationId) + "/read", {
      method: "POST"
    });
  }

  async function signup(payload) {
    if (!authClient) {
      throw createAuthError("Supabase Auth is not configured.");
    }

    var email = payload && typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    var password = payload && typeof payload.password === "string" ? payload.password : "";
    var username = payload && typeof payload.username === "string" ? payload.username.trim() : "";

    if (!email || !password || !username) {
      throw createAuthError("Enter a username, a valid email, and a password with at least 8 characters.");
    }

    var result = await authClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          username: username
        },
        emailRedirectTo: getAbsoluteUrl(SIGNUP_REDIRECT_PATH)
      }
    });

    if (result && result.error) {
      throw createAuthError(result.error.message || "Unable to create your account.");
    }

    setCachedSession(result && result.data ? result.data.session : null);
    cachedRenderUser = null;
    clearLegacySession();

    return {
      session: result && result.data ? result.data.session || null : null,
      user: normalizeSupabaseUser(result && result.data ? result.data.user : null),
      needsEmailConfirmation: !(result && result.data && result.data.session)
    };
  }

  async function login(payload) {
    if (!authClient) {
      throw createAuthError("Supabase Auth is not configured.");
    }

    var email = payload && typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    var password = payload && typeof payload.password === "string" ? payload.password : "";

    if (!email || !password) {
      throw createAuthError("Enter your email address and password.");
    }

    var result = await authClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (result && result.error) {
      throw createAuthError(result.error.message || "Unable to sign in.");
    }

    setCachedSession(result && result.data ? result.data.session : null);
    cachedRenderUser = null;
    clearLegacySession();

    return {
      session: result && result.data ? result.data.session || null : null,
      user: normalizeSupabaseUser(result && result.data ? result.data.user : null)
    };
  }

  async function logout() {
    if (authClient) {
      var result = await authClient.auth.signOut();
      if (result && result.error) {
        throw createAuthError(result.error.message || "Unable to log out.");
      }
    }

    clearSession();
    return null;
  }

  async function resetPassword(email) {
    if (!authClient) {
      throw createAuthError("Supabase Auth is not configured.");
    }

    var normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalizedEmail) {
      throw createAuthError("Enter a valid email address.");
    }

    var result = await authClient.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: getAbsoluteUrl(PASSWORD_RESET_PAGE_PATH)
    });

    if (result && result.error) {
      throw createAuthError(result.error.message || "Unable to send a password reset email.");
    }

    return result && result.data ? result.data : null;
  }

  async function updatePassword(password) {
    if (!authClient) {
      throw createAuthError("Supabase Auth is not configured.");
    }

    var nextPassword = typeof password === "string" ? password : "";
    if (nextPassword.length < 8) {
      throw createAuthError("Enter a password with at least 8 characters.");
    }

    var result = await authClient.auth.updateUser({
      password: nextPassword
    });

    if (result && result.error) {
      throw createAuthError(result.error.message || "Unable to update your password.");
    }

    return normalizeSupabaseUser(result && result.data ? result.data.user : null);
  }

  async function getCurrentUser() {
    var payload = await authApiRequest("/api/me");
    if (payload && payload.user) {
      setStoredUser(payload.user);
    }
    return payload;
  }

  global.GingiesApi = {
    API_BASE: resolveApiBase(),
    apiRequest: apiRequest,
    createJob: createJob,
    createServiceRequest: createServiceRequest,
    getJob: getJob,
    getContractorJobs: getContractorJobs,
    getAvailableContractorJobs: getAvailableContractorJobs,
    getContractorNotifications: getContractorNotifications,
    acceptJob: acceptJob,
    updateJobStatus: updateJobStatus,
    markContractorNotificationRead: markContractorNotificationRead,
    signup: signup,
    login: login,
    logout: logout,
    resetPassword: resetPassword,
    updatePassword: updatePassword,
    getCurrentUser: getCurrentUser,
    getCurrentSession: getCurrentSession,
    getAuthHeader: getAuthHeader,
    getStoredToken: getStoredToken,
    getStoredUser: getStoredUser,
    getSessionUser: getSessionUser,
    setStoredUser: setStoredUser,
    clearSession: clearSession,
    isAuthenticated: isAuthenticated,
    isAuthConfigured: isAuthConfigured,
    isRecoveryFlow: isRecoveryFlow
  };
})(window);
