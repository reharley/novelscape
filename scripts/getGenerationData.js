const generateUrl = (imageId) => {
  const data = {
    json: {
      id: imageId,
      //   authed: true,
    },
  };

  const jsonString = JSON.stringify(data);
  const encodedInput = encodeURIComponent(jsonString);
  const url = `https://civitai.com/api/trpc/image.getGenerationData?input=${encodedInput}`;

  return url;
};

const fetchGenerationData = async (id) => {
  const url = generateUrl(id);
  console.log(`Fetching data from URL: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `HTTP error! Status: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    const meta = data.result.data.json.meta;
    console.log('Generation Data:', meta);
    /*
    meta: {
        prompt: "score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up, 1girl, slim, fit, realistic, beautiful eyes,\nHermione Granger(/Harry potter)/,(ultra HD quality details), bushy brown hair and brown eyes, long hair\ngryffindor uniform, hogwarts school uniform, The Gryffindor jumper is red with yellow stripes in the waist and the neck, pleated skirt, long skirt, socks, white shirt, school uniform\nmouth opened, hiding, focusing on colorful beetle",
        negativePrompt: "score_6, score_5, score_4, pony, gaping, muscular, censored, furry, child, kid, chibi, 3d, monochrome, long neck",
        cfgScale: 7,
        steps: 20,
        sampler: "Euler a",
        seed: 1760381915,
        civitaiResources: [
            {
            type: "checkpoint",
            modelVersionId: 531417,
            modelVersionName: "pony-no-score_v4.0",
            },
            {
            type: "lora",
            weight: 0.5,
            modelVersionId: 579675,
            modelVersionName: "Pony v2.0",
            },
        ],
        Size: "832x1216",
        "Created Date": "2024-06-17T1907:04.1896966Z",
        clipSkip: 2,
    }*/
  } catch (error) {
    console.error('Error fetching generation data:', error);
  }
};

// Replace with your desired ID
const id = 16156243;

// Invoke the function
fetchGenerationData(id);
