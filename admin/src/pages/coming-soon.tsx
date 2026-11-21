import { Page } from "@/components/admin-layout"
import { Card, CardContent } from "@/components/ui/card"

export function ComingSoonPage({ group, title, description }: { group: string; title: string; description: string }) {
  return (
    <Page crumbs={[{ label: group }, { label: title }]} title={title} description={description}>
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          This section is designed in Figma and comes in a later phase.
        </CardContent>
      </Card>
    </Page>
  )
}
