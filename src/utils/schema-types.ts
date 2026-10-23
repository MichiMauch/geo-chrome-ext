import type { SchemaData } from '../types/analysis';

// All types of a schema node; '@type' alone misses multi-typed nodes like
// ["NewsArticle", "FAQPage"].
export function schemaTypesOf(s: SchemaData): string[] {
  if (Array.isArray(s['@types']) && s['@types'].length > 0) return s['@types'];
  const raw = s['@type'] as unknown;
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .map((t) =>
      t
        .trim()
        .replace(/^https?:\/\/(www\.)?schema\.org\//i, '')
        .replace(/^schema:/i, '')
    );
}

export function hasSchemaType(s: SchemaData, types: readonly string[]): boolean {
  return schemaTypesOf(s).some((t) => types.includes(t));
}

// LocalBusiness and the subtypes sites actually emit (schema.org has ~150).
// A Restaurant or Bakery is an organization too, and a local one.
export const LOCAL_BUSINESS_TYPES: readonly string[] = [
  'LocalBusiness', 'Store', 'OnlineStore',
  'FoodEstablishment', 'Restaurant', 'CafeOrCoffeeShop', 'Bakery', 'BarOrPub', 'Brewery', 'Winery', 'FastFoodRestaurant', 'IceCreamShop',
  'LodgingBusiness', 'Hotel', 'BedAndBreakfast', 'Hostel', 'Campground',
  'MedicalBusiness', 'MedicalClinic', 'Dentist', 'Physician', 'Pharmacy', 'Optician',
  'HealthAndBeautyBusiness', 'BeautySalon', 'HairSalon', 'DaySpa', 'NailSalon',
  'ProfessionalService', 'LegalService', 'Attorney', 'Notary', 'FinancialService', 'AccountingService', 'InsuranceAgency', 'RealEstateAgent', 'TravelAgency',
  'HomeAndConstructionBusiness', 'Electrician', 'Plumber', 'GeneralContractor', 'HousePainter', 'RoofingContractor', 'Locksmith', 'HVACBusiness',
  'AutomotiveBusiness', 'AutoRepair', 'AutoDealer',
  'SportsActivityLocation', 'ExerciseGym', 'EntertainmentBusiness', 'ChildCare', 'EmploymentAgency', 'AnimalShelter',
  'BikeStore', 'BookStore', 'ClothingStore', 'ElectronicsStore', 'FlowerShop', 'FurnitureStore', 'GardenStore', 'GroceryStore',
  'HardwareStore', 'JewelryStore', 'ShoeStore', 'SportingGoodsStore', 'ToyStore', 'WineStore',
];
