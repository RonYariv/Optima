/**
 * Rule-based failure root-cause classifier.
 *
 * Examines `errorType` and `toolName` from a failed tool call and returns
 * a stable string tag that can be stored in `failure_events.root_cause`.
 *
 * Rules are checked in priority order; the first match wins.
 * Returns `"unclassified"` when no rule matches.
 */

export type RootCause =
  | 'timeout'
  | 'rate_limit'
  | 'auth_failure'
  | 'invalid_input'
  | 'network_error'
  | 'not_found'
  | 'upstream_error'
  | 'filesystem_error'
  | 'unclassified';

/**
 * Priority-ordered classification rules.
 * Each rule has a regex tested against `"${errorType} ${toolName}"` (lowercase).
 */
const RULES: Array<{ pattern: RegExp; result: RootCause }> = [
  // Timeout — highest priority, commonly mis-reported as other errors
  {
    pattern: /timeout|etimeout|etimedout|deadline[._-]?exceeded|timed[._-]?out/i,
    result: 'timeout',
  },
  // Rate limiting
  {
    pattern: /rate[._-]?limit|429|too[._-]?many[._-]?requests?|quota[._-]?exceed|throttl/i,
    result: 'rate_limit',
  },
  // Authentication / authorisation
  {
    pattern: /auth|unauthorized|forbidden|401|403|invalid[._-]?token|credential|permission[._-]?denied/i,
    result: 'auth_failure',
  },
  // Network / connectivity
  {
    pattern: /econnrefused|enotfound|econnreset|econnaborted|enetunreach|network[._-]?error|connection[._-]?(refused|reset|failed)|socket[._-]?hang/i,
    result: 'network_error',
  },
  // Not found
  {
    pattern: /not[._-]?found|enoent|404|no[._-]?such[._-]?(file|resource|key)/i,
    result: 'not_found',
  },
  // Upstream server error
  {
    pattern: /server[._-]?error|internal[._-]?error|500|503|service[._-]?unavail|bad[._-]?gateway|502|upstream[._-]?(error|fail)/i,
    result: 'upstream_error',
  },
  // Input validation
  {
    pattern: /invalid[._-]?input|validation[._-]?(error|fail)|schema[._-]?error|bad[._-]?request|400|malformed|parse[._-]?error|invalid[._-]?param/i,
    result: 'invalid_input',
  },
];

// Separate tool-name-based rule (only fires when no error-type rule matched)
const FILESYSTEM_TOOL_PATTERN = /\bfile|write|read\b|\.fs\b|disk|storage|blob/i;

/**
 * Classify the root cause of a tool-call failure.
 *
 * @param errorType - The error type string from the telemetry payload (may be undefined/null)
 * @param toolName  - The tool name from the telemetry payload (may be undefined)
 * @returns A stable RootCause string tag
 */
export function classifyRootCause(
  errorType: string | null | undefined,
  toolName: string | undefined,
): RootCause {
  const combined = `${errorType ?? ''} ${toolName ?? ''}`;

  for (const { pattern, result } of RULES) {
    if (pattern.test(combined)) return result;
  }

  // Filesystem heuristic: only on tool name since error types are generic
  if (FILESYSTEM_TOOL_PATTERN.test(toolName ?? '')) return 'filesystem_error';

  return 'unclassified';
}
