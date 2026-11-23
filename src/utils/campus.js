/**
 * Campus Utilities & Normalization for Sri Vaatsalya Management Portal
 * 
 * Strict 3-Campus Setup:
 * 1. Sri Vaibhav Campus Day Scholar
 * 2. Sri Vaarahi Girls Hostel
 * 3. Sri Virinchi Boys Hostel
 */

const CAMPUS_DAY = 'Sri Vaibhav Campus Day Scholar';
const CAMPUS_GIRLS = 'Sri Vaarahi Girls Hostel';
const CAMPUS_BOYS = 'Sri Virinchi Boys Hostel';
const CAMPUS_ALL = 'All Campuses';

const CANONICAL_CAMPUSES = [CAMPUS_DAY, CAMPUS_GIRLS, CAMPUS_BOYS];

/**
 * Normalizes any raw campus string into one of the 3 canonical campus names,
 * or 'All Campuses'. Handles legacy variations stored in MongoDB.
 */
function normalizeCampus(raw) {
  if (!raw) return CAMPUS_DAY;
  const str = String(raw).trim().toLowerCase();
  if (str === 'all campuses' || str === 'all' || str === 'global') {
    return CAMPUS_ALL;
  }
  if (str.includes('vaarahi') || str.includes('girl')) {
    return CAMPUS_GIRLS;
  }
  if (str.includes('virinchi') || str.includes('boy')) {
    return CAMPUS_BOYS;
  }
  if (str.includes('vaibhav') || str.includes('day')) {
    return CAMPUS_DAY;
  }
  return CAMPUS_DAY;
}

/**
 * Checks if a campus string represents a valid regular admin campus
 * (Must be one of the 3 specific campuses; 'All Campuses' is disallowed).
 */
function isValidAdminCampus(raw) {
  if (!raw) return false;
  const str = String(raw).trim().toLowerCase();
  if (str === 'all campuses' || str === 'all' || str === 'global') return false;
  return str.includes('vaarahi') || str.includes('girl') ||
         str.includes('virinchi') || str.includes('boy') ||
         str.includes('vaibhav') || str.includes('day');
}

/**
 * Returns a MongoDB regex query that matches all variations of a campus name in the database.
 */
function getCampusRegex(campusName) {
  const norm = normalizeCampus(campusName);
  if (norm === CAMPUS_GIRLS) {
    return /(vaarahi|girl)/i;
  }
  if (norm === CAMPUS_BOYS) {
    return /(virinchi|boy)/i;
  }
  if (norm === CAMPUS_DAY) {
    return /(vaibhav|day(\s*scholar)?)/i;
  }
  return null;
}

/**
 * Builds a query object condition for campus based on user role and requested campus.
 * Regular admins are STRICTLY locked to their assigned campus; requestedCampus from frontend is ignored!
 * Superadmins can filter by requestedCampus, or view all if 'All Campuses' or omitted.
 */
function buildCampusCondition(user, requestedCampus) {
  if (!user) return {};

  if (user.role === 'superadmin') {
    if (requestedCampus && requestedCampus !== CAMPUS_ALL && requestedCampus !== 'All') {
      const regex = getCampusRegex(requestedCampus);
      return regex ? { campus: { $regex: regex } } : {};
    }
    return {};
  }

  // Regular admin: strictly locked to user.campus from token
  const adminCampus = user.campus;
  const regex = getCampusRegex(adminCampus);
  if (regex) {
    return { campus: { $regex: regex } };
  }
  // Fallback: exact match
  return { campus: adminCampus || CAMPUS_DAY };
}

/**
 * Checks if two campus strings refer to the same campus.
 */
function isSameCampus(campusA, campusB) {
  return normalizeCampus(campusA) === normalizeCampus(campusB);
}

module.exports = {
  CAMPUS_DAY,
  CAMPUS_GIRLS,
  CAMPUS_BOYS,
  CAMPUS_ALL,
  CANONICAL_CAMPUSES,
  normalizeCampus,
  isValidAdminCampus,
  getCampusRegex,
  buildCampusCondition,
  isSameCampus
};
