"use client";
import { useTeam } from "@/components/team-provider";
import { ActionForm, Submit } from "@/components/forms";
import { Avatar, PageHeading } from "@/components/ui";
import { ImageUpload } from "@/components/image-upload";

export default function Profile() {
  const { profile } = useTeam();
  const path = profile.profile_photos?.storage_path ?? "";
  return (
    <div className="narrow-page">
      <PageHeading title="Min profil" />
      <section className="card editor form-stack">
        <div className="profile-photo-heading">
          <Avatar name={profile.full_name} userId={profile.id} path={path} large />
          <h2>{profile.full_name}</h2>
        </div>
        <ActionForm key={`upload-${path}`}>
          <input type="hidden" name="action" value="profile-photo" />
          <input type="hidden" name="expected_path" value={path} />
          <ImageUpload maxMB={3} label="Profilbilde" required />
          <p className="field-hint">Bildet beskjæres til et kvadrat og vises i innlegg og Tropp.</p>
          <Submit>{path ? "Bytt profilbilde" : "Last opp profilbilde"}</Submit>
        </ActionForm>
        {path && (
          <ActionForm key={`remove-${path}`}>
            <input type="hidden" name="action" value="remove-profile-photo" />
            <input type="hidden" name="expected_path" value={path} />
            <Submit secondary>Fjern profilbilde</Submit>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
