import { MenuItem, MenuLabel, MenuSeparator } from '../../components/ui/menu'
import { useDisconnectSlack, useSendSlackTest, useSlackStatus } from './use-slack'

export function SlackMenuSection() {
  const status = useSlackStatus().data
  const sendTest = useSendSlackTest()
  const disconnect = useDisconnectSlack()

  // Not configured on the server, or still loading: the menu shows nothing for Slack.
  if (!status?.configured) return null

  return (
    <>
      {status.connected ? (
        <>
          <MenuLabel>
            Alerts go to #{status.channelName ?? 'channel'} in {status.teamName ?? 'your workspace'}
          </MenuLabel>
          <MenuItem onSelect={() => sendTest.mutate()}>Send test</MenuItem>
          <MenuItem onSelect={() => disconnect.mutate()}>Disconnect</MenuItem>
        </>
      ) : (
        <MenuItem onSelect={() => window.location.assign('/api/integrations/slack/connect')}>
          Connect Slack
        </MenuItem>
      )}
      <MenuSeparator />
    </>
  )
}
