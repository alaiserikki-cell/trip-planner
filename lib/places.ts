import type { TripType } from "./types";

// Starting-city suggestions. Coordinates are only used by the offline planner to
// rough out travel time/cost when Gemini isn't configured.
export const INDIAN_CITIES: { name: string; lat: number; lng: number; airport: boolean }[] = [
  { name: "Mumbai", lat: 19.08, lng: 72.88, airport: true },
  { name: "Delhi", lat: 28.61, lng: 77.21, airport: true },
  { name: "Bengaluru", lat: 12.97, lng: 77.59, airport: true },
  { name: "Hyderabad", lat: 17.39, lng: 78.49, airport: true },
  { name: "Chennai", lat: 13.08, lng: 80.27, airport: true },
  { name: "Kolkata", lat: 22.57, lng: 88.36, airport: true },
  { name: "Pune", lat: 18.52, lng: 73.86, airport: true },
  { name: "Ahmedabad", lat: 23.02, lng: 72.57, airport: true },
  { name: "Jaipur", lat: 26.91, lng: 75.79, airport: true },
  { name: "Lucknow", lat: 26.85, lng: 80.95, airport: true },
  { name: "Chandigarh", lat: 30.73, lng: 76.78, airport: true },
  { name: "Gurugram", lat: 28.46, lng: 77.03, airport: false },
  { name: "Noida", lat: 28.54, lng: 77.39, airport: false },
  { name: "Kochi", lat: 9.93, lng: 76.27, airport: true },
  { name: "Thiruvananthapuram", lat: 8.52, lng: 76.94, airport: true },
  { name: "Coimbatore", lat: 11.02, lng: 76.96, airport: true },
  { name: "Indore", lat: 22.72, lng: 75.86, airport: true },
  { name: "Bhopal", lat: 23.26, lng: 77.41, airport: true },
  { name: "Nagpur", lat: 21.15, lng: 79.09, airport: true },
  { name: "Surat", lat: 21.17, lng: 72.83, airport: true },
  { name: "Vadodara", lat: 22.31, lng: 73.18, airport: true },
  { name: "Patna", lat: 25.59, lng: 85.14, airport: true },
  { name: "Bhubaneswar", lat: 20.3, lng: 85.82, airport: true },
  { name: "Guwahati", lat: 26.14, lng: 91.74, airport: true },
  { name: "Visakhapatnam", lat: 17.69, lng: 83.22, airport: true },
  { name: "Vijayawada", lat: 16.51, lng: 80.65, airport: true },
  { name: "Mysuru", lat: 12.3, lng: 76.64, airport: false },
  { name: "Mangaluru", lat: 12.91, lng: 74.86, airport: true },
  { name: "Goa", lat: 15.49, lng: 73.83, airport: true },
  { name: "Dehradun", lat: 30.32, lng: 78.03, airport: true },
  { name: "Amritsar", lat: 31.63, lng: 74.87, airport: true },
  { name: "Ludhiana", lat: 30.9, lng: 75.86, airport: false },
  { name: "Kanpur", lat: 26.45, lng: 80.33, airport: false },
  { name: "Varanasi", lat: 25.32, lng: 82.97, airport: true },
  { name: "Ranchi", lat: 23.34, lng: 85.31, airport: true },
  { name: "Raipur", lat: 21.25, lng: 81.63, airport: true },
  { name: "Udaipur", lat: 24.59, lng: 73.71, airport: true },
  { name: "Jodhpur", lat: 26.24, lng: 73.02, airport: true },
  { name: "Madurai", lat: 9.93, lng: 78.12, airport: true },
  { name: "Nashik", lat: 20.0, lng: 73.79, airport: false },
  { name: "Aurangabad", lat: 19.88, lng: 75.34, airport: true },
  { name: "Srinagar", lat: 34.08, lng: 74.8, airport: true },
  { name: "Jammu", lat: 32.73, lng: 74.86, airport: true },
  { name: "Shimla", lat: 31.1, lng: 77.17, airport: false },
  { name: "Siliguri", lat: 26.73, lng: 88.4, airport: true },
];

export function findCity(name: string) {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return (
    INDIAN_CITIES.find((c) => c.name.toLowerCase() === n) ??
    INDIAN_CITIES.find((c) => n.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(n)) ??
    null
  );
}

/** A destination Gemini planned before, remembered in the database for when Gemini is unavailable. */
export interface LibraryDestination extends Destination {
  key: string;
  uses: number;
}

export interface Destination {
  name: string;
  region: string;
  lat: number;
  lng: number;
  types: TripType[];
  airportHours: number; // extra hours from the nearest airport
  trainHours: number; // extra hours from the nearest railhead
  stayPerNight: [number, number]; // per person, sharing
  spendPerDay: [number, number]; // food, local transport, activities
  goodMonths: number[];
  involvesTrek?: boolean;
  highlights: string[];
}

// A small, opinionated catalogue for the offline planner. Numbers are rough
// planning bands, not prices — every surface labels them as estimates.
export const DESTINATIONS: Destination[] = [
  {
    name: "Gokarna", region: "Karnataka", lat: 14.55, lng: 74.32, types: ["Beach", "Just relax", "Adventure"],
    airportHours: 3, trainHours: 0.5, stayPerNight: [700, 1800], spendPerDay: [900, 1800], goodMonths: [10, 11, 12, 1, 2, 3],
    highlights: ["Arrive, check in, sunset at Om Beach", "Beach trek: Kudle → Om → Half Moon → Paradise", "Kayaking at Om Beach and a lazy café afternoon", "Mahabaleshwar temple and Gokarna town walk", "Slow breakfast, one last swim, head home"],
  },
  {
    name: "Pondicherry", region: "Puducherry", lat: 11.93, lng: 79.83, types: ["Beach", "City & food", "Culture & heritage", "Just relax"],
    airportHours: 3, trainHours: 0.3, stayPerNight: [900, 2200], spendPerDay: [1000, 2000], goodMonths: [10, 11, 12, 1, 2, 3],
    highlights: ["Check in, evening walk on Promenade Beach", "French Quarter cafés and cycling the White Town lanes", "Auroville and a day at Paradise Beach", "Surf lesson at Serenity Beach, seafood dinner", "Brunch and head home"],
  },
  {
    name: "Varkala", region: "Kerala", lat: 8.73, lng: 76.71, types: ["Beach", "Just relax"],
    airportHours: 1.5, trainHours: 0.2, stayPerNight: [900, 2200], spendPerDay: [900, 1800], goodMonths: [10, 11, 12, 1, 2, 3],
    highlights: ["Arrive, cliff-top sunset and dinner", "Beach morning, Ayurvedic massage in the afternoon", "Backwater canoe trip at Kappil", "Surf lesson and the North Cliff café crawl", "Easy morning and leave"],
  },
  {
    name: "Havelock Island", region: "Andaman", lat: 12.01, lng: 92.98, types: ["Beach", "Adventure", "Just relax"],
    airportHours: 2.5, trainHours: 99, stayPerNight: [1800, 4000], spendPerDay: [1500, 3000], goodMonths: [11, 12, 1, 2, 3, 4],
    highlights: ["Fly to Port Blair, ferry to Havelock", "Radhanagar Beach and sunset", "Scuba try-dive or snorkelling at Elephant Beach", "Kayaking through mangroves", "Neil Island day trip", "Ferry back and fly home"],
  },
  {
    name: "Manali", region: "Himachal Pradesh", lat: 32.24, lng: 77.19, types: ["Mountains", "Adventure"],
    airportHours: 2, trainHours: 7, stayPerNight: [800, 2000], spendPerDay: [1000, 2000], goodMonths: [3, 4, 5, 6, 10, 11, 12, 1],
    highlights: ["Arrive, settle in, Old Manali cafés", "Solang Valley — snow activities or paragliding", "Hadimba temple and Vashisht hot springs", "Day trip toward Sissu via Atal Tunnel", "Riverside morning and head back"],
  },
  {
    name: "Rishikesh", region: "Uttarakhand", lat: 30.09, lng: 78.27, types: ["Adventure", "Mountains", "Culture & heritage"],
    airportHours: 1, trainHours: 0.5, stayPerNight: [600, 1800], spendPerDay: [800, 1600], goodMonths: [9, 10, 11, 2, 3, 4, 5],
    highlights: ["Arrive, Ganga aarti at Triveni Ghat", "White-water rafting, café hopping in Tapovan", "Waterfall walk and bungee or giant swing", "Sunrise yoga and Beatles Ashram", "Slow breakfast and leave"],
  },
  {
    name: "Kasol", region: "Himachal Pradesh", lat: 32.01, lng: 77.31, types: ["Mountains", "Just relax", "Adventure"],
    airportHours: 1.5, trainHours: 8, stayPerNight: [600, 1500], spendPerDay: [800, 1500], goodMonths: [3, 4, 5, 6, 9, 10, 11],
    involvesTrek: true,
    highlights: ["Arrive, riverside evening in Kasol", "Chalal village walk along the Parvati", "Manikaran gurudwara and hot springs", "Tosh village day trip", "Morning by the river, head home"],
  },
  {
    name: "Darjeeling", region: "West Bengal", lat: 27.04, lng: 88.26, types: ["Mountains", "Culture & heritage", "Just relax"],
    airportHours: 3, trainHours: 3, stayPerNight: [900, 2200], spendPerDay: [900, 1800], goodMonths: [3, 4, 5, 10, 11, 12],
    highlights: ["Arrive, Mall Road and Glenary's", "Tiger Hill sunrise and Batasia Loop", "Tea estate tour and toy train joyride", "Day trip to Mirik or Lamahatta", "Momos, shopping, head down"],
  },
  {
    name: "Coorg", region: "Karnataka", lat: 12.42, lng: 75.74, types: ["Mountains", "Just relax", "Adventure"],
    airportHours: 3, trainHours: 3, stayPerNight: [1200, 3000], spendPerDay: [900, 1800], goodMonths: [10, 11, 12, 1, 2, 3, 4],
    highlights: ["Check into a coffee-estate homestay", "Abbey Falls and Raja's Seat sunset", "Coffee plantation walk and Dubare elephant camp", "River rafting at Barapole or a lazy estate day", "Estate breakfast and drive back"],
  },
  {
    name: "Munnar", region: "Kerala", lat: 10.09, lng: 77.06, types: ["Mountains", "Just relax"],
    airportHours: 4, trainHours: 4, stayPerNight: [1000, 2500], spendPerDay: [900, 1800], goodMonths: [9, 10, 11, 12, 1, 2, 3],
    highlights: ["Drive up through tea country", "Eravikulam National Park and tea museum", "Top Station viewpoint and Mattupetty dam", "Spice garden walk and a slow afternoon", "Morning mist, head down"],
  },
  {
    name: "Udaipur", region: "Rajasthan", lat: 24.59, lng: 73.71, types: ["Culture & heritage", "City & food", "Just relax"],
    airportHours: 0.5, trainHours: 0.2, stayPerNight: [900, 2500], spendPerDay: [1000, 2000], goodMonths: [10, 11, 12, 1, 2, 3],
    highlights: ["Arrive, rooftop dinner facing Lake Pichola", "City Palace, Jagdish temple, boat ride at sunset", "Day trip to Kumbhalgarh fort", "Old-city lanes, Bagore ki Haveli show", "Breakfast by the lake and leave"],
  },
  {
    name: "Jaipur", region: "Rajasthan", lat: 26.91, lng: 75.79, types: ["Culture & heritage", "City & food"],
    airportHours: 0.5, trainHours: 0.2, stayPerNight: [800, 2200], spendPerDay: [1000, 2000], goodMonths: [10, 11, 12, 1, 2, 3],
    highlights: ["Arrive, dinner at Chokhi Dhani", "Amber Fort, Jal Mahal, Nahargarh sunset", "City Palace, Hawa Mahal and bazaar crawl", "Food walk: pyaaz kachori, lassi, ghevar", "Brunch and head home"],
  },
  {
    name: "Hampi", region: "Karnataka", lat: 15.33, lng: 76.46, types: ["Culture & heritage", "Adventure", "Just relax"],
    airportHours: 1.5, trainHours: 0.5, stayPerNight: [700, 1800], spendPerDay: [800, 1500], goodMonths: [10, 11, 12, 1, 2],
    highlights: ["Arrive, sunset at Hemakuta Hill", "Cycle the Royal Centre ruins and Vittala temple", "Coracle ride and bouldering across the river", "Sunrise at Matanga Hill, lazy hippie-island afternoon", "Breakfast and leave"],
  },
  {
    name: "Shillong & Cherrapunji", region: "Meghalaya", lat: 25.57, lng: 91.88, types: ["Mountains", "Adventure", "Just relax"],
    airportHours: 3, trainHours: 3, stayPerNight: [900, 2200], spendPerDay: [1000, 2000], goodMonths: [10, 11, 12, 1, 2, 3, 4],
    involvesTrek: true,
    highlights: ["Fly to Guwahati, drive to Shillong", "Cherrapunji: Nohkalikai falls and Mawsmai caves", "Double-decker root bridge hike", "Dawki river and Mawlynnong village", "Shillong cafés, head back"],
  },
  {
    name: "Alleppey", region: "Kerala", lat: 9.5, lng: 76.34, types: ["Just relax", "City & food"],
    airportHours: 1.5, trainHours: 0.2, stayPerNight: [1500, 3500], spendPerDay: [900, 1800], goodMonths: [9, 10, 11, 12, 1, 2, 3],
    highlights: ["Board an overnight houseboat", "Backwaters by shikara, toddy-shop lunch", "Marari beach afternoon", "Kerala food trail in Kochi on the way back", "Head home"],
  },
  {
    name: "McLeod Ganj", region: "Himachal Pradesh", lat: 32.24, lng: 76.32, types: ["Mountains", "Culture & heritage", "Just relax"],
    airportHours: 1, trainHours: 3, stayPerNight: [700, 1800], spendPerDay: [800, 1500], goodMonths: [3, 4, 5, 6, 9, 10, 11],
    highlights: ["Arrive, Tibetan dinner", "Dalai Lama temple and Bhagsu waterfall", "Triund trek or a slow Dharamkot café day", "Norbulingka Institute and tea gardens", "Morning momos, leave"],
  },
  {
    name: "Jaisalmer", region: "Rajasthan", lat: 26.92, lng: 70.91, types: ["Culture & heritage", "Adventure"],
    airportHours: 0.5, trainHours: 0.2, stayPerNight: [800, 2200], spendPerDay: [1000, 2000], goodMonths: [10, 11, 12, 1, 2],
    highlights: ["Arrive, sunset at Gadisar lake", "Living fort and havelis walk", "Sam dunes: jeep safari, camel ride, desert camp night", "Kuldhara village and Bada Bagh", "Head home"],
  },
  {
    name: "Kolkata", region: "West Bengal", lat: 22.57, lng: 88.36, types: ["City & food", "Culture & heritage"],
    airportHours: 0.5, trainHours: 0.2, stayPerNight: [900, 2200], spendPerDay: [900, 1800], goodMonths: [10, 11, 12, 1, 2],
    highlights: ["Arrive, Park Street dinner", "Victoria Memorial, Howrah bridge, Kumartuli", "North Kolkata food walk: kathi rolls to mishti", "College Street books and a Ganga ferry", "Brunch at Flurys and leave"],
  },
  {
    name: "Spiti Valley", region: "Himachal Pradesh", lat: 32.25, lng: 78.03, types: ["Mountains", "Adventure"],
    airportHours: 9, trainHours: 12, stayPerNight: [800, 1800], spendPerDay: [1200, 2200], goodMonths: [6, 7, 8, 9],
    highlights: ["Drive in via Shimla/Kinnaur", "Kaza, Key monastery", "Chicham bridge and Kibber", "Langza, Hikkim, Komic villages", "Chandratal lake", "Drive out via Manali"],
  },
  {
    name: "Mumbai", region: "Maharashtra", lat: 19.08, lng: 72.88, types: ["City & food"],
    airportHours: 0.7, trainHours: 0.5, stayPerNight: [1200, 3000], spendPerDay: [1200, 2500], goodMonths: [10, 11, 12, 1, 2, 3],
    highlights: ["Arrive, Marine Drive at sunset", "Colaba, Kala Ghoda and Fort food walk", "Bandra lanes and a night out", "Elephanta Caves ferry", "Breakfast at an Irani café and leave"],
  },
];
