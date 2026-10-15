import { OptionsForm } from '../components/OptionsForm';
import { Panel } from '../components/Panel';
import { ScreenHeading } from '../components/ScreenHeading';
import { navigate } from '../router';

export function OptionsScreen() {
  return (
    <main className="scene" id="main">
      <Panel aria-labelledby="options-title">
        <ScreenHeading id="options-title">Options</ScreenHeading>
        <OptionsForm
          backLabel="Main Menu"
          note="Each battle uses the options saved when it starts."
          onBack={() => {
            navigate({ name: 'menu' });
          }}
        />
      </Panel>
    </main>
  );
}
