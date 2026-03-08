(function (global) {
  var PRODUCTION_API_BASE = "https://gingies-api.onrender.com";
  var LOCAL_API_BASE = "http://localhost:4000";
  var LOCAL_HOSTS = ["localhost", "127.0.0.1"];

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

  global.GingiesApi = {
    API_BASE: resolveApiBase(),
    apiRequest: apiRequest,
    createJob: createJob,
    getJob: getJob
  };
})(window);
