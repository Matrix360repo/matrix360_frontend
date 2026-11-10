'use strict';

/**
 * Matrix360 Dynamic B2B vs. B2C Affinity Logic Engine
 *
 * Automatically switches audience discovery, qualification parameters, and pitch generation
 * based on client/project context:
 * - `b2b_industrial`: e.g. Lakhotia (industrial parks, warehousing, factories, logistics)
 * - `b2c_affinity`: e.g. Shree Heights / Vrindavan Greens (residential buyers, local upgraders, metro diaspora)
 */

const PROFILE_TYPES = Object.freeze({
  B2B_INDUSTRIAL: 'b2b_industrial',
  B2C_AFFINITY: 'b2c_affinity',
  UNCLASSIFIED: 'unclassified'
});

const B2B_KEYWORDS = [
  'lakhotia', 'industrial', 'warehouse', 'warehousing', 'factory', 'manufacturing',
  'logistics', 'procurement', 'distributor', 'b2b', 'shed', 'plant', 'commercial'
];

const B2C_KEYWORDS = [
  'shree_heights', 'shree heights', 'shree', 'vrindavan', 'vrindavan_greens',
  'residential', 'apartment', 'apartments', 'flat', 'flats', 'home', 'homes',
  'housing', 'b2c', 'family', 'gated community', 'lifestyle', 'chandannagar'
];

/**
 * Classifies a workspace/project profile into B2B Industrial vs B2C Affinity
 */
function classifyProfile(context = {}) {
  if ([PROFILE_TYPES.B2B_INDUSTRIAL, PROFILE_TYPES.B2C_AFFINITY].includes(context.profileType)) return context.profileType;
  const project = String(context.project || '').toLowerCase();
  if (['shree_heights', 'vrindavan_greens'].includes(project)) return PROFILE_TYPES.B2C_AFFINITY;
  if (project === 'lakhotia') return PROFILE_TYPES.B2B_INDUSTRIAL;
  const combined = [context.industry || '', context.productType || '', context.marketModel || ''].join(' ').toLowerCase();

  let b2bScore = 0;
  let b2cScore = 0;

  for (const kw of B2B_KEYWORDS) {
    if (combined.includes(kw)) b2bScore += 2;
  }

  for (const kw of B2C_KEYWORDS) {
    if (combined.includes(kw)) b2cScore += 2;
  }

  if (b2cScore > b2bScore) {
    return PROFILE_TYPES.B2C_AFFINITY;
  }
  return b2bScore > 0 ? PROFILE_TYPES.B2B_INDUSTRIAL : PROFILE_TYPES.UNCLASSIFIED;
}

/**
 * Generates structured audience targeting, qualification parameters, and pitch strategy
 */
function getAffinityStrategy(context = {}) {
  const profileType = classifyProfile(context);
  if (profileType === PROFILE_TYPES.UNCLASSIFIED) throw new Error('Verified client product type is required before Marketing can choose B2B or B2C affinity logic.');
  const isB2C = profileType === PROFILE_TYPES.B2C_AFFINITY;

  const isSpecificShree = Boolean(
    context.project === 'shree_heights' ||
    context.project === 'shree_heights'
  );
  const isSpecificLakhotia = Boolean(
    context.project === 'lakhotia'
  );
  const isVrindavan = Boolean(
    context.project === 'vrindavan_greens'
  );

  const b2cProjectName = context.businessName || context.project || (isVrindavan ? 'Vrindavan Greens' : (isSpecificShree ? 'Shree Heights' : 'Residential Project'));
  const b2bProjectName = context.businessName || context.project || (isSpecificLakhotia ? 'Lakhotia Industrial Park' : 'Industrial Complex');

  if (isB2C) {
    return {
      profile_type: PROFILE_TYPES.B2C_AFFINITY,
      profile_label: 'B2C Residential Affinity & Diaspora',
      project_name: b2cProjectName,
      core_segments: isSpecificShree || isVrindavan ? [
        {
          id: 'chandannagar_locals',
          name: 'Chandannagar Local Residents',
          description: 'Established households upgrading from older ancestral or congested homes to modern gated security and amenities.',
          affinity_signal: 'Local resident / heritage homeowner in Chandannagar municipal area',
          priority: 'High'
        },
        {
          id: 'hooghly_upgraders',
          name: 'Hooghly Belt Upgraders',
          description: 'Families and professionals in Serampore, Chinsurah, Bandel, and Rishra looking for premium lifestyle residential complexes.',
          affinity_signal: 'Commuters & professionals within 15km GT Road / Howrah-Bandel rail corridor',
          priority: 'High'
        },
        {
          id: 'metro_diaspora',
          name: 'Kolkata & Metro Diaspora with Chandannagar Roots',
          description: 'White-collar professionals in Kolkata IT hubs (Salt Lake, New Town), Bengaluru, NCR, or overseas seeking a family home, parents’ residence, or weekend retreat in their native town.',
          affinity_signal: 'Hometown roots in Hooghly/Chandannagar with metro income capability',
          priority: 'High'
        }
      ] : [
        {
          id: 'local_residents',
          name: 'Local High-Intent Residents',
          description: `Established local residents seeking premium quality and modern amenities from ${b2cProjectName}.`,
          affinity_signal: 'Local homeowner or active in-market resident',
          priority: 'High'
        },
        {
          id: 'regional_upgraders',
          name: 'Regional Upgraders & Commuters',
          description: `Regional professionals and family households seeking security and lifestyle connectivity.`,
          affinity_signal: 'Regional commuters within primary urban corridor',
          priority: 'High'
        },
        {
          id: 'metro_diaspora',
          name: 'Metro Professionals & Diaspora',
          description: `High-income professionals seeking a reliable family asset or lifestyle home.`,
          affinity_signal: 'Metro income capability with regional ties',
          priority: 'High'
        }
      ],
      qualification_criteria: [
        { key: 'unit_budget', label: 'Unit Preference & Budget', requirement: '2BHK (₹35L–₹50L) or 3BHK (₹55L–₹75L)' },
        { key: 'family_life_stage', label: 'Family Life-Stage', requirement: 'Nuclear family upgrade or multi-generational retirement living' },
        { key: 'affinity_connection', label: 'Hometown / Cultural Affinity', requirement: isSpecificShree ? 'Existing ties to Chandannagar culture, Strand, French heritage, or quiet residential living' : 'Personal or family affinity to project location and community' },
        { key: 'financial_readiness', label: 'Financial Readiness', requirement: 'Pre-qualified home loan eligibility or 20%+ self-funded downpayment' },
        { key: 'move_in_timeline', label: 'Timeline to Purchase', requirement: 'Immediate possession to within 6 months' }
      ],
      channels: ['WhatsApp', 'Instagram', 'Facebook', 'Email', 'YouTube', 'Website'],
      recommended_primary_channels: ['WhatsApp', 'Facebook', 'Instagram'],
      pitch_framing: {
        value_proposition: isSpecificShree
          ? 'Modern riverine living with serene heritage charm, curated community amenities, and hassle-free connectivity to Kolkata.'
          : `Modern, premium residential living with curated community amenities and dedicated services from ${b2cProjectName}.`,
        emotional_hook: 'A modern home that honors your roots — spaces built for family, comfort, and peaceful everyday living.',
        call_to_action: 'Download floor plans & book an exclusive private preview walk-through'
      }
    };
  }

  // B2B Industrial
  return {
    profile_type: PROFILE_TYPES.B2B_INDUSTRIAL,
    profile_label: 'B2B Industrial, Logistics & Warehousing',
    project_name: b2bProjectName,
    core_segments: isSpecificLakhotia ? [
      {
        id: 'manufacturing_units',
        name: 'Manufacturing & Engineering MSMEs',
        description: 'Light engineering, fabrication, plastics, packaging, and assembly units needing robust heavy-duty power and floorplates.',
        affinity_signal: 'Operating factories seeking expansion or relocation out of dense city zones',
        priority: 'High'
      },
      {
        id: 'logistics_warehousing',
        name: '3PL & E-Commerce Logistics Operators',
        description: 'Third-party logistics, FMCG distributors, and warehousing firms requiring direct NH6 / national highway frontage and 40ft container turning radii.',
        affinity_signal: 'Distribution hubs servicing Kolkata metropolitan and Eastern India corridors',
        priority: 'High'
      },
      {
        id: 'wholesale_distributors',
        name: 'Industrial Material & Raw Stock Distributors',
        description: 'Suppliers of steel, hardware, electricals, and polymers requiring secure compounds with 24/7 weighbridge and gated operations.',
        affinity_signal: 'Registered GST entities with multi-state supply chain transit',
        priority: 'Medium'
      }
    ] : [
      {
        id: 'commercial_buyers',
        name: 'Commercial & Enterprise Clients',
        description: `Enterprise clients and operating businesses seeking facility expansion with ${b2bProjectName}.`,
        affinity_signal: 'Active corporate entity with commercial expansion requirements',
        priority: 'High'
      },
      {
        id: 'procurement_heads',
        name: 'Procurement & Operations Decision-Makers',
        description: `Operational heads requiring scalable infrastructure, reliable utilities, and strategic logistics access.`,
        affinity_signal: 'Verified corporate operations executive',
        priority: 'High'
      },
      {
        id: 'channel_partners',
        name: 'Distributors & Channel Partners',
        description: `Registered business entities requiring reliable distribution footprint and long-term lease security.`,
        affinity_signal: 'Registered trade partner with verified commercial track record',
        priority: 'Medium'
      }
    ],
    qualification_criteria: [
      { key: 'space_requirement', label: 'Floor Space Requirement', requirement: '10,000 sq.ft to 100,000+ sq.ft industrial shed or warehouse' },
      { key: 'power_infrastructure', label: 'Power & HT Load', requirement: 'Dedicated HT substation / 100kVA+ requirement' },
      { key: 'heavy_vehicle_access', label: 'Access & Logistics', requirement: 'Direct trailer/multi-axle access and container docking heights' },
      { key: 'commercial_standing', label: 'Commercial Standing', requirement: 'Verified CIN/GST, active operational history > 3 years, audited turnover' },
      { key: 'lease_or_outright', label: 'Deal Structure', requirement: 'Long-term 9-year lease or outright industrial plot purchase' }
    ],
    channels: ['LinkedIn', 'WhatsApp', 'Email', 'Google Business Profile', 'Website', 'SMS'],
    recommended_primary_channels: ['LinkedIn', 'WhatsApp', 'Email'],
    pitch_framing: {
      value_proposition: isSpecificLakhotia
        ? 'Review approved industrial infrastructure specifications, access, utilities and clearance status before describing operational readiness.'
        : `Review approved industrial infrastructure specifications for ${b2bProjectName} against the buyer’s operating requirements.`,
      emotional_hook: 'Help buyers assess whether the location and facilities fit their operating routes and requirements.',
      call_to_action: 'Request technical specifications & schedule an on-site masterplan inspection'
    }
  };
}

module.exports = {
  PROFILE_TYPES,
  classifyProfile,
  getAffinityStrategy
};
