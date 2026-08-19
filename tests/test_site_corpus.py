from pathlib import Path

from terra_research_node.site_corpus import _is_research_image, build_site_corpus, extract_gallery_spec


def test_extract_gallery_spec_for_dynamic_test_page() -> None:
    page = """
    const branch='experiment-015-himalaya-tibet-v2-30-234961-83-056124';
    const base=`https://raw.githubusercontent.com/x/y/${branch}/published/experiment-015`;
    """
    assert extract_gallery_spec(page) == (
        "experiment-015-himalaya-tibet-v2-30-234961-83-056124",
        "experiment-015",
    )


def test_research_image_rules_cover_tests_and_stations() -> None:
    assert _is_research_image("web/public/experiment-013/gallery/1990.jpg")
    assert _is_research_image("web/public/sahara-station/dem.png")
    assert _is_research_image("web/public/arctic-90n/ice.jpg")
    assert not _is_research_image("web/public/assets/logo.png")


def test_local_corpus_deduplicates_by_content(tmp_path: Path) -> None:
    first = tmp_path / "web" / "public" / "experiment-001" / "a.png"
    second = tmp_path / "web" / "public" / "experiment-002" / "b.png"
    first.parent.mkdir(parents=True)
    second.parent.mkdir(parents=True)
    first.write_bytes(b"same-image")
    second.write_bytes(b"same-image")

    records, manifest = build_site_corpus(tmp_path, download_remote=False)

    assert len(records) == 1
    assert manifest["unique_image_count"] == 1
