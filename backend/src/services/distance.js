export var CITY_COORDS = {
  columbus: { lat: 39.9612, lng: -82.9988 },
  dayton: { lat: 39.7589, lng: -84.1916 },
  cincinnati: { lat: 39.1031, lng: -84.512 },
  cleveland: { lat: 41.4993, lng: -81.6944 }
};

export function resolveCoords(city, lat, lng) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat: lat, lng: lng };
  }

  if (!city) {
    return null;
  }

  var key = String(city).toLowerCase().trim();
  if (CITY_COORDS[key]) {
    return CITY_COORDS[key];
  }

  var bestKey = Object.keys(CITY_COORDS).find(function (known) {
    return key.indexOf(known) !== -1;
  });

  return bestKey ? CITY_COORDS[bestKey] : null;
}

export function haversineMiles(from, to) {
  if (!from || !to) {
    return null;
  }

  var toRad = function (value) {
    return (value * Math.PI) / 180;
  };

  var earthRadiusMiles = 3958.8;
  var dLat = toRad(to.lat - from.lat);
  var dLon = toRad(to.lng - from.lng);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}
