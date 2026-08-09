const MAP_BOUNDS = { minLat: 48.5645, maxLat: 48.5945, minLon: 13.447, maxLon: 13.489 };
const MAP_VIEWBOX_SIZE = 700;
const MAP_PADDING = 45;
const KM_PER_LATITUDE_DEGREE = 111.32;
const KM_PER_LONGITUDE_DEGREE = KM_PER_LATITUDE_DEGREE
  * Math.cos(((MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2) * Math.PI / 180);
const MAP_WIDTH_KM = (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon) * KM_PER_LONGITUDE_DEGREE;
const MAP_HEIGHT_KM = (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat) * KM_PER_LATITUDE_DEGREE;
const MAP_UNITS_PER_KM = (MAP_VIEWBOX_SIZE - MAP_PADDING * 2) / Math.max(MAP_WIDTH_KM, MAP_HEIGHT_KM);
const MAP_CONTENT_WIDTH = MAP_WIDTH_KM * MAP_UNITS_PER_KM;
const MAP_CONTENT_HEIGHT = MAP_HEIGHT_KM * MAP_UNITS_PER_KM;
const MAP_OFFSET_X = (MAP_VIEWBOX_SIZE - MAP_CONTENT_WIDTH) / 2;
const MAP_OFFSET_Y = (MAP_VIEWBOX_SIZE - MAP_CONTENT_HEIGHT) / 2;

function projectPoint(lat, lon) {
  const xKm = (lon - MAP_BOUNDS.minLon) * KM_PER_LONGITUDE_DEGREE;
  const yKm = (MAP_BOUNDS.maxLat - lat) * KM_PER_LATITUDE_DEGREE;
  return {
    x: MAP_OFFSET_X + xKm * MAP_UNITS_PER_KM,
    y: MAP_OFFSET_Y + yKm * MAP_UNITS_PER_KM,
  };
}

function mapPath(points) {
  return points.map(([lat, lon], index) => {
    const point = projectPoint(lat, lon);
    return `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).join(' ');
}

export function createMapGeometry(levels) {
  const locations = Object.fromEntries(levels.map((item) => [item.id, item]));
  const route = (ids) => mapPath(ids.map((id) => [locations[id].lat, locations[id].lon]));
  const scaleStartX = MAP_VIEWBOX_SIZE - MAP_PADDING - MAP_UNITS_PER_KM;
  const scaleEndX = MAP_VIEWBOX_SIZE - MAP_PADDING;
  const scaleY = MAP_VIEWBOX_SIZE - 26;

  return {
    viewBox: `0 0 ${MAP_VIEWBOX_SIZE} ${MAP_VIEWBOX_SIZE}`,
    danube: mapPath([[48.5752, 13.447], [48.5750, 13.457], [48.5752, 13.467], [48.5739, 13.478], [48.5743, 13.489]]),
    inn: mapPath([[48.5645, 13.448], [48.5675, 13.454], [48.5705, 13.463], [48.5725, 13.471], [48.5739, 13.478]]),
    ilz: mapPath([[48.5945, 13.459], [48.5906, 13.462], [48.5870, 13.461], [48.5835, 13.466], [48.5783, 13.471], [48.5741, 13.477]]),
    routeNorth: route(['hals', 'home', 'bschuett', 'oberhaus', 'dom', 'dreifluesseeck']),
    routeSouth: route(['uni', 'zauberberg', 'dom', 'tabakfabrik', 'dreifluesseeck']),
    scale: {
      startX: scaleStartX.toFixed(1),
      endX: scaleEndX.toFixed(1),
      centerX: ((scaleStartX + scaleEndX) / 2).toFixed(1),
      y: scaleY,
    },
    markers: levels.map((item) => ({ id: item.id, ...projectPoint(item.lat, item.lon) })),
  };
}
