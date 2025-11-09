export { default } from '../home';
import { buildHomeProps } from '../home';

export async function getStaticProps() {
	return buildHomeProps('PT');
}
