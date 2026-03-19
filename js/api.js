(function (global) {
  var PRODUCTION_API_BASE = "https://gingies-api.onrender.com";
  var LOCAL_API_BASE = "http://localhost:4000";
  var LOCAL_HOSTS = ["localhost", "127.0.0.1"];
  var TOKEN_STORAGE_KEY = "gingies.auth.token";
  var USER_STORAGE_KEY = "gingies.auth.user";

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
    } catch (error) {
      return null;
    }
  }

  function getStoredToken() {
    var storage = getStorage();
    if (!storage) {
      return "";
    }

    return storage.getItem(TOKEN_STORAGE_KEY) || "";
  }

  function setStoredToken(token) {
    var storage = getStorage();
    if (!storage) {
      return;
    }

    if (!token) {
      storage.removeItem(TOKEN_STORAGE_KEY);
      return;
    }

    storage.setItem(TOKEN_STORAGE_KEY, String(token));
  }

  function getStoredUser() {
    var storage = getStorage();
    if (!storage) {
      return null;
    }

    var raw = storage.getItem(USER_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      storage.removeItem(USER_STORAGE_KEY);
      return null;
    }
  }

  function setStoredUser(user) {
    var storage = getStorage();
    if (!storage) {
      return;
    }

    if (!user || typeof user !== "object") {
      storage.removeItem(USER_STORAGE_KEY);
      return;
    }

    storage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }

  function clearSession() {
    var storage = getStorage();
    if (!storage) {
      return;
    }

    storage.removeItem(TOKEN_STORAGE_KEY);
    storage.removeItem(USER_STORAGE_KEY);
  }

  function saveSession(payload) {
    if (payload && payload.token) {
      setStoredToken(payload.token);
    }
    if (payload && payload.user) {
      setStoredUser(payload.user);
    }
    return payload;
  }

  function buildAuthHeaders(headers) {
    var nextHeaders = headers ? Object.assign({}, headers) : {};
    var token = getStoredToken();

    if (token) {
      nextHeaders.Authorization = "Bearer " + token;
    }

    return nextHeaders;
  }

  function decodeBase64Url(value) {
    if (!value) {
      return "";
    }

    var normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    var padded = normalized + "===".slice((normalized.length + 3) % 4);
    return global.atob(padded);
  }

  function decodeToken(token) {
    if (!token || token.split(".").length < 2 || typeof global.atob !== "function") {
      return null;
    }

    try {
      var payload = decodeBase64Url(token.split(".")[1]);
      return JSON.parse(payload);
    } catch (error) {
      return null;
    }
  }

  function getSessionUser() {
    return getStoredUser() || decodeToken(getStoredToken());
  }

  function isAuthenticated() {
    return Boolean(getStoredToken());
  }

  function createJob(payload) {
    return apiRequest("/api/jobs", {
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

  function signup(payload) {
    return apiRequest("/api/signup", {
      method: "POST",
      body: JSON.stringify(payload)
    }).then(saveSession);
  }

  function login(payload) {
    return apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify(payload)
    }).then(saveSession);
  }

  function logout() {
    var token = getStoredToken();
    var request = token
      ? apiRequest("/api/logout", {
        method: "POST",
        headers: buildAuthHeaders()
      })
      : Promise.resolve(null);

    return request
      .catch(function () {
        return null;
      })
      .then(function (result) {
        clearSession();
        return result;
      });
  }

  function getCurrentUser() {
    return apiRequest("/api/me", {
      headers: buildAuthHeaders()
    }).then(function (payload) {
      if (payload && payload.user) {
        setStoredUser(payload.user);
      }
      return payload;
    });
  }

  global.GingiesApi = {
    API_BASE: resolveApiBase(),
    apiRequest: apiRequest,
    createJob: createJob,
    getJob: getJob,
    signup: signup,
    login: login,
    logout: logout,
    getCurrentUser: getCurrentUser,
    getStoredToken: getStoredToken,
    getStoredUser: getStoredUser,
    getSessionUser: getSessionUser,
    setStoredUser: setStoredUser,
    clearSession: clearSession,
    isAuthenticated: isAuthenticated
  };
})(window);
