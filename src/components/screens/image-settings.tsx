"use client";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "@/components/team-provider";
import { QueryState } from "@/components/query-state";
import { PageHeading } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";

export default function ImageSettings() {
  const { scope, profile } = useTeam();
  const query = useQuery({
    ...queries.imageSettings(scope),
    enabled: profile.base_role === "admin",
  });
  return (
    <>
      <PageHeading title="Bildeinnstillinger" />
      <QueryState query={query} title="Bildeinnstillingene kunne ikke hentes">
        {(data) => (
          <div className="card editor">
            <ActionForm key={data.version}>
              <input type="hidden" name="action" value="image-settings" />
              <input type="hidden" name="expected_version" value={data.version} />
              <label className="toggle-label">
                <input
                  type="checkbox"
                  role="switch"
                  name="responsive_images"
                  defaultChecked={data.responsive_images}
                  aria-describedby="image-sizing-help"
                />
                <span>Tilpass bildestørrelse til skjermen</span>
              </label>
              <p id="image-sizing-help" className="muted">
                På: Last mindre bilder på små skjermer. Av: Bruk full bildestørrelse. Gjelder
                profilbilder og innleggsbilder for hele laget.
              </p>
              <Submit>Lagre</Submit>
            </ActionForm>
          </div>
        )}
      </QueryState>
    </>
  );
}
