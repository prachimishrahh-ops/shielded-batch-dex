// The 'test_batch_dex' test program.
import batch_dex.aleo;
program test_batch_dex.aleo {
    @test
    script test_it() {
        let result: u32 = batch_dex.aleo/main(1u32, 2u32);
        assert_eq(result, 3u32);
    }

    @test
    @should_fail
    transition do_nothing() {
        let result: u32 = batch_dex.aleo/main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    async constructor() {}
}
