import { Tooltip } from "@mantine/core";
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

import { type AdminRole } from "./roles";
import { useRole } from "./useRole";

interface RequireRoleProps {
  /** Minimum required role. */
  role: AdminRole;
  /**
   * If "hide" (default), children are not rendered when the current
   * user lacks the required role. If "disable", children are wrapped
   * in a tooltip explaining the restriction and the underlying button
   * is disabled.
   */
  fallback?: "hide" | "disable";
  /**
   * Tooltip text shown when fallback="disable". Defaults to a generic
   * read-only message.
   */
  reason?: string;
  children: ReactNode;
}

/**
 * Conditional rendering helper that gates children behind the current
 * admin role. Use around create / edit / delete buttons:
 *
 * ```tsx
 * <RequireRole role="admin" fallback="disable">
 *   <Button onClick={...}>Delete</Button>
 * </RequireRole>
 * ```
 */
export function RequireRole({
  role,
  fallback = "hide",
  reason = "Read-only account: ask an administrator to make changes.",
  children,
}: RequireRoleProps) {
  const current = useRole();
  const allowed = current === "admin" || current === role;

  if (allowed) return <>{children}</>;

  if (fallback === "hide") return null;

  // For "disable", clone the single child element and add `disabled`.
  // Wrap it in a Tooltip so the user understands *why* it's disabled.
  const onlyChild = Children.only(children);
  if (!isValidElement(onlyChild)) {
    return null;
  }

  type DisableableProps = { disabled?: boolean };
  const disabled = cloneElement(onlyChild as ReactElement<DisableableProps>, {
    disabled: true,
  });

  // The clone only reaches the direct child. When that is a Tooltip around the
  // button, as on the list pages, `disabled` switches the tooltip off and the
  // button stays live, so the disabled fieldset is what actually disables
  // every control inside, however deep.
  return (
    <Tooltip label={reason} withArrow>
      <fieldset
        disabled
        style={{
          display: "inline-block",
          border: 0,
          margin: 0,
          padding: 0,
          minWidth: 0,
        }}
      >
        {disabled}
      </fieldset>
    </Tooltip>
  );
}
