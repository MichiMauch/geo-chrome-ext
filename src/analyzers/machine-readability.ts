import { PageData, AnalysisCategory, CategoryDetail } from '../types/analysis';
import { BaseAnalyzer } from './base';
import { GEO_CONFIG } from '../config/geo-config';

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

export class MachineReadabilityAnalyzer extends BaseAnalyzer {
  protected readonly categoryKey = 'cat_machineReadability';

  analyze(pageData: PageData): AnalysisCategory {
    const details: CategoryDetail[] = [];
    let weightedScore = 0;
    let totalWeight = 0;
    const config = GEO_CONFIG.machineReadability;

    // Check 1: Schema.org Structured Data
    const relevantSchemaTypes = [
      'Article', 'NewsArticle', 'BlogPosting', 'FAQPage', 'HowTo', 'Product',
      'Organization', 'Person', 'WebPage', 'BreadcrumbList',
    ];

    const foundSchemas = pageData.schema.filter((s) =>
      relevantSchemaTypes.includes(s['@type'])
    );

    const hasSchema = foundSchemas.length > 0;
    const schemasNeeded = 2;
    const schemaScore = Math.min(1, foundSchemas.length / schemasNeeded);

    details.push({
      criterionKey: 'criterion_schema',
      found: hasSchema,
      value: hasSchema ? 'value_schemaTypes' : 'value_noneFound',
      weight: config.weights.schemaOrg,
      progress: {
        current: Math.min(foundSchemas.length, schemasNeeded),
        target: schemasNeeded,
        unitKey: 'unit_schemaTypes',
      },
    });

    weightedScore += schemaScore * config.weights.schemaOrg;
    totalWeight += config.weights.schemaOrg;

    // Check 1b: Schema-Completeness — required fields per @type.
    // Only schemas with actual property data (typically JSON-LD) are validated.
    // Microdata / RDFa entries that carry only @type are skipped from validation
    // so they don't fail the score just because the extractor can't read them.
    const completeness = this.evaluateSchemaCompleteness(pageData.schema);
    if (completeness.totalRequired > 0) {
      const completenessRatio = completeness.foundRequired / completeness.totalRequired;
      const isComplete = completenessRatio >= 0.99;
      const summary =
        completeness.missingByType.length > 0
          ? completeness.missingByType
              .map((m) => `${m.type}: ${m.missing.join(', ')}`)
              .join(' · ')
          : 'value_complete';

      details.push({
        criterionKey: 'criterion_schema_completeness',
        found: isComplete,
        value: summary,
        weight: config.weights.schemaCompleteness,
        progress: {
          current: completeness.foundRequired,
          target: completeness.totalRequired,
          unitKey: 'unit_required_fields',
        },
      });

      weightedScore += completenessRatio * config.weights.schemaCompleteness;
      totalWeight += config.weights.schemaCompleteness;
    }

    // Check 2: Klare Entitäten erkannt
    const entityScore = this.evaluateEntities(pageData);
    const hasEntities = entityScore > 0.3;
    const entityPercent = Math.round(entityScore * 100);

    details.push({
      criterionKey: 'criterion_entities',
      found: hasEntities,
      value: `${entityPercent}%`,
      weight: config.weights.entities,
      progress: {
        current: entityPercent,
        target: 100,
        unitKey: 'unit_percent',
      },
    });

    weightedScore += entityScore * config.weights.entities;
    totalWeight += config.weights.entities;

    // Check 3: Semantisches HTML
    const semanticScore = this.evaluateSemanticHTML(pageData.semanticElements);
    const hasSemanticHTML = semanticScore > 0.5;
    const semanticPercent = Math.round(semanticScore * 100);

    details.push({
      criterionKey: 'criterion_semanticHtml',
      found: hasSemanticHTML,
      value: `${semanticPercent}%`,
      weight: config.weights.semanticHtml,
      progress: {
        current: semanticPercent,
        target: 100,
        unitKey: 'unit_percent',
      },
    });

    weightedScore += semanticScore * config.weights.semanticHtml;
    totalWeight += config.weights.semanticHtml;

    // Check 4: llms.txt vorhanden
    const hasLlmsTxt = pageData.llmsTxt?.exists ?? false;
    const llmsTxtScore = hasLlmsTxt ? 1 : 0;

    details.push({
      criterionKey: 'criterion_llmsTxt',
      found: hasLlmsTxt,
      value: hasLlmsTxt ? 'value_present' : 'value_notFound',
      weight: config.weights.llmsTxt,
      progress: {
        current: hasLlmsTxt ? 1 : 0,
        target: 1,
        unitKey: 'unit_file',
      },
    });

    weightedScore += llmsTxtScore * config.weights.llmsTxt;
    totalWeight += config.weights.llmsTxt;

    // Check 5: AI-Crawler in robots.txt nicht blockiert
    const robotsTxt = pageData.robotsTxt;
    const total = robotsTxt?.totalChecked ?? 0;
    const blockedCount = robotsTxt?.blockedBots.length ?? 0;
    const allowedCount = Math.max(0, total - blockedCount);
    const robotsScore = total > 0 ? allowedCount / total : 1;
    const allBotsAllowed = blockedCount === 0;
    const hasAnyBlock = blockedCount > 0;

    const robotsValue = !robotsTxt?.exists
      ? 'value_allBotsAllowed'
      : allBotsAllowed
        ? 'value_allBotsAllowed'
        : blockedCount === total
          ? 'value_allBotsBlocked'
          : 'value_someBotsBlocked';

    details.push({
      criterionKey: 'criterion_robotsTxt',
      found: allBotsAllowed,
      value: robotsValue,
      weight: config.weights.robotsTxt,
      progress: {
        current: allowedCount,
        target: total,
        unitKey: 'unit_bots',
      },
    });

    weightedScore += robotsScore * config.weights.robotsTxt;
    totalWeight += config.weights.robotsTxt;

    const recommendations: string[] = [];
    if (!hasSchema) recommendations.push('no_schema');
    if (completeness.totalRequired > 0 && completeness.missingByType.length > 0) {
      recommendations.push('schema_incomplete');
    }
    if (!hasEntities) recommendations.push('few_entities');
    if (!hasSemanticHTML) recommendations.push('weak_semantic_html');
    if (!hasLlmsTxt) recommendations.push('no_llms_txt');
    if (hasAnyBlock) recommendations.push('ai_bots_blocked');

    return this.createCategory(0, weightedScore, totalWeight, details, recommendations);
  }

  private evaluateEntities(pageData: PageData): number {
    let score = 0;

    const hasOrgSchema = pageData.schema.some(
      (s) => s['@type'] === 'Organization' || s.publisher
    );
    if (hasOrgSchema) score += 0.3;

    const hasPersonSchema = pageData.schema.some(
      (s) => s['@type'] === 'Person' || (s.author && s.author['@type'] === 'Person')
    );
    if (hasPersonSchema) score += 0.2;

    const productPatterns = [
      /\b(Produkt|Service|Dienstleistung|Lösung|Software|Tool|App)\b/i,
      /\b(product|service|solution|software|tool|application)\b/i,
    ];

    const allText = this.getFullText(pageData);
    for (const pattern of productPatterns) {
      if (pattern.test(allText)) {
        score += 0.15;
        break;
      }
    }

    if (pageData.meta.description && pageData.meta.description.length > 50) {
      score += 0.2;
    }

    if (pageData.author) {
      score += 0.15;
    }

    return Math.min(1, score);
  }

  private evaluateSchemaCompleteness(
    schemas: PageData['schema']
  ): {
    foundRequired: number;
    totalRequired: number;
    missingByType: { type: string; missing: string[] }[];
  } {
    const required = GEO_CONFIG.machineReadability.schemaRequiredFields;
    let foundRequired = 0;
    let totalRequired = 0;
    const missingByType: { type: string; missing: string[] }[] = [];

    for (const schema of schemas) {
      const type = schema['@type'];
      if (typeof type !== 'string') continue;
      const requiredFields = required[type];
      if (!requiredFields) continue;

      // A schema is "shallow" if it carries only the @type key (extracted from
      // microdata/RDFa where we can't read properties). Skip those — we can't
      // validate them fairly.
      const keys = Object.keys(schema).filter((k) => k !== '@type');
      if (keys.length === 0) continue;

      const missing: string[] = [];
      for (const field of requiredFields) {
        const value = (schema as Record<string, unknown>)[field];
        if (isEmptyValue(value)) {
          missing.push(field);
        } else {
          foundRequired++;
        }
        totalRequired++;
      }

      if (missing.length > 0) {
        missingByType.push({ type, missing });
      }
    }

    return { foundRequired, totalRequired, missingByType };
  }

  private evaluateSemanticHTML(
    semanticElements: PageData['semanticElements']
  ): number {
    let score = 0;
    const weights = GEO_CONFIG.machineReadability.scoring.semanticElements;

    for (const [key, weight] of Object.entries(weights)) {
      const domKey = ('has' + key.charAt(0).toUpperCase() + key.slice(1)) as keyof typeof semanticElements;
      if (semanticElements[domKey]) {
        score += weight;
      }
    }

    return Math.min(1, score);
  }
}
