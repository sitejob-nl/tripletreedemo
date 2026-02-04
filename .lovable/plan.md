
# User Invitation via Supabase Auth

Dit plan implementeert een uitnodigingssysteem via Supabase's ingebouwde `inviteUserByEmail` functie, inclusief aangepaste HTML email templates voor zowel uitnodigingen als wachtwoord vergeten.

---

## Voordelen van Supabase Auth Emails

| Aspect | Supabase | Resend |
|--------|----------|--------|
| Geen extra API key nodig | ✅ | ❌ |
| Ingebouwde token handling | ✅ | ❌ |
| Email templates in dashboard | ✅ | ❌ |
| Gratis tier | 3.000 emails/maand | 100 emails/dag |
| Setup complexiteit | Laag | Hoog |

---

## Overzicht van de Flow

```text
1. Admin klikt "Uitnodigen" in CustomersTable
2. Admin vult alleen email + projecten in (geen wachtwoord!)
3. Edge function roept supabase.auth.admin.inviteUserByEmail() aan
4. Supabase stuurt automatisch uitnodigingsmail met magische link
5. Gebruiker klikt link → komt op /set-password pagina
6. Gebruiker kiest eigen wachtwoord → account is actief
```

---

## Email Templates Aanpassen

De templates worden aangepast in het Supabase Dashboard onder:
**Authentication → Email Templates**

### 1. Invite Email Template

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Triple Tree Dashboard</h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 32px;">
      <h2 style="color: #18181b; font-size: 22px; margin: 0 0 16px;">Je bent uitgenodigd!</h2>
      <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
        Je hebt een uitnodiging ontvangen om toegang te krijgen tot het Triple Tree Dashboard. 
        Klik op onderstaande knop om je account te activeren.
      </p>
      
      <!-- CTA Button -->
      <a href="{{ .ConfirmationURL }}" 
         style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
        Account activeren
      </a>
      
      <p style="color: #71717a; font-size: 14px; margin: 32px 0 0;">
        Deze link is 24 uur geldig. Als je deze uitnodiging niet hebt aangevraagd, kun je deze email negeren.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background: #fafafa; padding: 20px 32px; border-top: 1px solid #e4e4e7; text-align: center;">
      <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
        Triple Tree Dashboard | Automatisch gegenereerd
      </p>
    </div>
  </div>
</body>
</html>
```

### 2. Password Reset Email Template

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Triple Tree Dashboard</h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 32px;">
      <h2 style="color: #18181b; font-size: 22px; margin: 0 0 16px;">Wachtwoord resetten</h2>
      <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
        Je hebt een verzoek ingediend om je wachtwoord te resetten. 
        Klik op onderstaande knop om een nieuw wachtwoord in te stellen.
      </p>
      
      <!-- CTA Button -->
      <a href="{{ .ConfirmationURL }}" 
         style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
        Nieuw wachtwoord instellen
      </a>
      
      <p style="color: #71717a; font-size: 14px; margin: 32px 0 0;">
        Als je dit verzoek niet hebt ingediend, kun je deze email negeren. 
        Je wachtwoord blijft ongewijzigd.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background: #fafafa; padding: 20px 32px; border-top: 1px solid #e4e4e7; text-align: center;">
      <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
        Triple Tree Dashboard | Automatisch gegenereerd
      </p>
    </div>
  </div>
</body>
</html>
```

---

## Technische Implementatie

### 1. Database Wijzigingen

Een kleine hulptabel om projectkoppelingen vast te leggen vóór de gebruiker accepteert:

```sql
CREATE TABLE public.pending_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  project_ids UUID[] DEFAULT '{}',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: alleen admins
ALTER TABLE pending_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pending invitations"
  ON pending_invitations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
```

### 2. Edge Function: `invite-user`

Update de bestaande `create-customer` edge function om `inviteUserByEmail` te gebruiken:

```typescript
// Wijzigingen in create-customer/index.ts:

// In plaats van createUser met password:
const { data: newUser, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
  email,
  {
    redirectTo: `${siteUrl}/set-password`,
    data: {
      invited_by: requestingUser.id,
      project_ids: projectIds // Metadata voor later
    }
  }
);

// Sla pending invitation op voor projectkoppeling
await supabaseAdmin.from('pending_invitations').upsert({
  email,
  project_ids: projectIds,
  invited_by: requestingUser.id
});
```

### 3. Auth Hook: Koppel Projecten na Acceptatie

Een database trigger die projecten koppelt zodra de gebruiker zijn account bevestigt:

```sql
-- Trigger functie om projecten te koppelen na signup
CREATE OR REPLACE FUNCTION handle_new_user_from_invite()
RETURNS TRIGGER AS $$
DECLARE
  pending_record RECORD;
BEGIN
  -- Check of er een pending invitation is voor deze email
  SELECT * INTO pending_record 
  FROM pending_invitations 
  WHERE email = NEW.email;
  
  IF pending_record IS NOT NULL THEN
    -- Wijs 'user' rol toe
    INSERT INTO user_roles (user_id, role)
    VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
    
    -- Koppel projecten
    INSERT INTO customer_projects (user_id, project_id, created_by)
    SELECT NEW.id, unnest(pending_record.project_ids), pending_record.invited_by
    ON CONFLICT DO NOTHING;
    
    -- Verwijder pending invitation
    DELETE FROM pending_invitations WHERE email = NEW.email;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger op auth.users (via Supabase hook)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_from_invite();
```

### 4. Frontend Wijzigingen

**CustomersTable.tsx:**
- Verwijder het wachtwoord veld
- Verander knoptekst naar "Uitnodigen"
- Toon pending invitations met "Opnieuw versturen" optie

**Nieuwe pagina: `/set-password`**
- Vergelijkbaar met `/reset-password`
- Wordt automatisch geopend via Supabase's magic link
- Gebruiker stelt wachtwoord in

---

## Bestanden die Worden Aangepast

| Bestand | Actie | Beschrijving |
|---------|-------|--------------|
| `supabase/migrations/xxx.sql` | Nieuw | pending_invitations tabel + trigger |
| `supabase/functions/create-customer/index.ts` | Update | Gebruik `inviteUserByEmail` |
| `src/components/Admin/CustomersTable.tsx` | Update | Verwijder wachtwoord, toon pending |
| `src/hooks/useCustomerProjects.ts` | Update | Nieuwe hook voor pending invitations |
| `src/pages/SetPassword.tsx` | Nieuw | Pagina voor invited users |
| `src/App.tsx` | Update | Route `/set-password` toevoegen |

---

## Stappen voor de Admin

Na implementatie moet je eenmalig de email templates aanpassen in Supabase:

1. Ga naar **Supabase Dashboard → Authentication → Email Templates**
2. Selecteer **"Invite user"** template
3. Plak de custom HTML (hierboven)
4. Selecteer **"Reset password"** template  
5. Plak de custom HTML (hierboven)
6. Klik **Save**

---

## Voordelen van deze Aanpak

1. **Geen extra kosten** - Supabase's gratis tier (3.000 emails/maand) is voldoende
2. **Geen API keys beheren** - Alles via Supabase
3. **Betere UX** - Gebruiker kiest eigen wachtwoord
4. **Consistente branding** - Beide emails hebben dezelfde stijl
5. **Eenvoudiger code** - Minder edge functions nodig
