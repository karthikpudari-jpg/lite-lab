/**
 * Resolves the normal range that applies to one patient for one parameter.
 * Prefers a gender-exact ParameterNormalRange rule whose age band (if any)
 * contains the patient's age, then any gender-agnostic ("Any") rule whose
 * age band matches, and falls back to the parameter's own flat
 * normalRangeLow/High when nothing more specific matches (or age/gender is
 * unknown).
 */
const GENDER_ALIASES = { m: 'male', f: 'female', o: 'other' };

function normalizeGender(gender) {
  const g = (gender || '').trim().toLowerCase();
  return GENDER_ALIASES[g] || g;
}

function resolveNormalRange(parameter, age, gender) {
  const rules = parameter.ParameterNormalRanges || [];
  const normalizedGender = normalizeGender(gender);
  const ageValue = age == null || age === '' ? null : Number(age);

  const ageMatches = (rule) => {
    if (rule.ageMin != null && (ageValue == null || ageValue < rule.ageMin)) return false;
    if (rule.ageMax != null && (ageValue == null || ageValue > rule.ageMax)) return false;
    return true;
  };

  const candidates = rules.filter(ageMatches);
  const genderMatch = normalizedGender
    ? candidates.find((r) => normalizeGender(r.gender) === normalizedGender)
    : null;
  const anyMatch = candidates.find((r) => normalizeGender(r.gender || 'any') === 'any');
  const chosen = genderMatch || anyMatch;

  if (chosen) {
    return { normalRangeLow: chosen.normalRangeLow, normalRangeHigh: chosen.normalRangeHigh, matchedRuleId: chosen.id };
  }
  return { normalRangeLow: parameter.normalRangeLow, normalRangeHigh: parameter.normalRangeHigh, matchedRuleId: null };
}

module.exports = { resolveNormalRange };
