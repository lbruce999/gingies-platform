export function parsePagination(query) {
  var page = Math.max(1, Number(query.page || 1));
  var limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  var offset = (page - 1) * limit;

  return {
    page: page,
    limit: limit,
    offset: offset
  };
}
